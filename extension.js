const vscode = require('vscode');
const axios =require('axios');

// --- Configuration ---

const FIREBASE_FUNCTION_URL = 'https://translate-bmauiqdhpa-uc.a.run.app';


let criticalDecorationType;
let warningDecorationType;
let suggestionDecorationType;


let scanningDecorationType;


const DAILY_REQUEST_LIMIT = 100;
const MAX_LINE_LIMIT = 10;


const analysisCache = new Map();

class AiCodeLensProvider {
    provideCodeLenses(document, token) {
        const topOfFile = new vscode.Range(0, 0, 0, 0);

        const analyzeCommand = {
            title: "✅ Analyze Code with AI (Sinhala)",
            command: "translate-to-sinhala.analyzeCode",
            arguments: []
        };
        const analyzeCodeLens = new vscode.CodeLens(topOfFile, analyzeCommand);

        const clearCommand = {
            title: "❌ Clear Analysis",
            command: "translate-to-sinhala.clearDecorations",
            arguments: []
        };
        const clearCodeLens = new vscode.CodeLens(topOfFile, clearCommand);

        return [analyzeCodeLens, clearCodeLens];
    }
}



async function activate(context) {

    const createGutterIcon = (color) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${color}" /></svg>`;
        return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    };

    const neutralTextColor = 'rgba(180, 180, 180, 0.9)';


    criticalDecorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: createGutterIcon('rgba(255, 0, 0, 0.7)'),
        borderWidth: '0 0 1px 0',
        borderStyle: 'solid',
        borderColor: 'rgba(255, 0, 0, 0.7)', 
        after: {
            margin: '0 0 0 1.5em',
            color: neutralTextColor
        }
    });

    warningDecorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: createGutterIcon('rgba(255, 165, 0, 0.7)'),
        borderWidth: '0 0 1px 0',
        borderStyle: 'dotted',
        borderColor: 'rgba(255, 165, 0, 0.7)', 
        after: {
            margin: '0 0 0 1.5em',
            color: neutralTextColor
        }
    });

    suggestionDecorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: createGutterIcon('rgba(0, 150, 255, 0.6)'),
        borderWidth: '0 0 1px 0',
        borderStyle: 'dotted',
        borderColor: 'rgba(0, 150, 255, 0.6)',
        after: {
            margin: '0 0 0 1.5em',
            color: neutralTextColor
        }
    });


    scanningDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(0, 150, 255, 0.1)',
        isWholeLine: true,
    });


    try {
        const codeLensProvider = new AiCodeLensProvider();
        const disposableCodeLens = vscode.languages.registerCodeLensProvider({ pattern: "**/*" }, codeLensProvider);
        context.subscriptions.push(disposableCodeLens);


        const analyzeCommand = vscode.commands.registerCommand('translate-to-sinhala.analyzeCode', () => analyzeAndDecorate(context));

        const clearCommand = vscode.commands.registerCommand('translate-to-sinhala.clearDecorations', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.setDecorations(criticalDecorationType, []);
                editor.setDecorations(warningDecorationType, []);
                editor.setDecorations(suggestionDecorationType, []);
                vscode.window.setStatusBarMessage('AI analysis cleared.', 3000);
            }
        });

        context.subscriptions.push(analyzeCommand, clearCommand);

    } catch (error) {
        console.error('Error during activation:', error);
        vscode.window.showErrorMessage('Failed to activate the AI Code Analyzer extension.');
    }
}


async function analyzeAndDecorate(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // --- Daily Rate Limiting Check ---
    const usageData = context.globalState.get('usageData', { count: 0, date: new Date().toDateString() });
    const today = new Date().toDateString();

    if (usageData.date !== today) {
        usageData.date = today;
        usageData.count = 0;
    }

    if (usageData.count >= DAILY_REQUEST_LIMIT) {
        vscode.window.showErrorMessage(`You have reached the daily limit of ${DAILY_REQUEST_LIMIT} requests. Please try again tomorrow.`);
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const isSelection = !selection.isEmpty;
    
    const fullCode = document.getText();
    const analysisRange = isSelection ? selection : new vscode.Range(document.positionAt(0), document.positionAt(fullCode.length));

    // --- Line Limit Check ---
    const lineCount = analysisRange.end.line - analysisRange.start.line + 1;
    if (lineCount > MAX_LINE_LIMIT) {
        vscode.window.showErrorMessage(`The selected code is too long (${lineCount} lines). Please select a block of code with ${MAX_LINE_LIMIT} lines or fewer.`);
        return;
    }
    
    usageData.count++;
    await context.globalState.update('usageData', usageData);


    editor.setDecorations(criticalDecorationType, []);
    editor.setDecorations(warningDecorationType, []);
    editor.setDecorations(suggestionDecorationType, []);


    let currentLine = analysisRange.start.line;
    const endLine = analysisRange.end.line;
    const animationInterval = setInterval(() => {
        const range = document.lineAt(currentLine).range;
        editor.setDecorations(scanningDecorationType, [range]);
        currentLine++;
        if (currentLine > endLine) {
            currentLine = analysisRange.start.line;
        }
    }, 100);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "AI Code Analysis",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ message: "Analyzing code with AI..." });
            
            const issues = await getAIReviewAndTranslation(fullCode, isSelection ? analysisRange : null);

            clearInterval(animationInterval);
            editor.setDecorations(scanningDecorationType, []);

            if (!Array.isArray(issues) || issues.length === 0) {
                vscode.window.showInformationMessage('AI analysis complete. No issues found.');
                return;
            }

            progress.report({ message: "Applying decorations..." });
            applyDecorations(editor, issues);

            const summary = createSummary(issues);
            const remainingRequests = DAILY_REQUEST_LIMIT - usageData.count;
            vscode.window.showInformationMessage(`${summary} (Daily requests remaining: ${remainingRequests})`);

        } catch (error) {
            clearInterval(animationInterval);
            editor.setDecorations(scanningDecorationType, []);
            console.error('Error during analysis and decoration:', error);
            vscode.window.showErrorMessage('Failed to get AI code analysis.');
        }
    });
}


async function getAIReviewAndTranslation(code, selectionRange) {
    let promptIntro = `As an expert code reviewer, analyze the following code. For each issue found, provide:
        1. "line": The absolute line number from the file.
        2. "codeSnippet": The exact, complete line of code where the issue occurs.
        3. "issue": A detailed English description of the problem and why it's an issue.
        4. "sinhalaIssue": A translation of the detailed description into Sinhala.
        5. "severity": Classify the issue's severity as "Critical", "Warning", or "Suggestion".
           - "Critical": Security vulnerabilities (SQL Injection, XSS), code that will crash, data loss risks.
           - "Warning": Deprecated code, potential bugs, bad practices (e.g., loose comparisons).
           - "Suggestion": Stylistic issues, naming conventions, line length, minor improvements.`;
    
    if (selectionRange) {
        promptIntro += `\n\nIMPORTANT: Focus your analysis ONLY on the lines between line ${selectionRange.start.line + 1} and line ${selectionRange.end.line + 1}.`;
    }

    const prompt = `${promptIntro}

        Your response MUST be a valid JSON array of objects. It is essential to return all issues found. If no issues, return an empty array [].
        
        Example:
        [
            {
                "line": 15,
                "codeSnippet": "$query = \\"SELECT * FROM users WHERE id = \\" . $user_id;",
                "issue": "This line is vulnerable to SQL injection because it directly includes user input in the query string. A malicious user could provide input that alters the query's logic.",
                "sinhalaIssue": "මෙම රේඛාව SQL එන්නත් කිරීමේ අවදානමට ලක්ව ඇත, මන්ද එය විමසුම් තන්තුවට පරිශීලක ආදානය සෘජුවම ඇතුළත් කරයි. ද්වේශසහගත පරිශීලකයෙකුට විමසුමේ තර්කනය වෙනස් කරන ආදානයක් සැපයිය හැකිය.",
                "severity": "Critical"
            }
        ]

        Here is the complete file to analyze:
        \`\`\`
        ${code}
        \`\`\`
    `;

    try {

        const response = await axios.post(FIREBASE_FUNCTION_URL, {
            prompt: prompt 
        });


        const content = response.data.choices[0].message.content;
        console.log("Raw AI Response Content:", content);
        if (!content) return null;

        let parsedData;
        try {
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```|({[\s\S]*})|(\[[\s\S]*\])/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[2] || jsonMatch[3]) : content;
            parsedData = JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse JSON from AI response.", e);
            return null;
        }

        if (Array.isArray(parsedData)) return parsedData;
        if (typeof parsedData === 'object' && parsedData !== null) {
            const arrayKey = Object.keys(parsedData).find(k => Array.isArray(parsedData[k]));
            if (arrayKey) return parsedData[arrayKey];
            if (parsedData.line && parsedData.issue) return [parsedData];
        }
        return null;
    } catch (error) {
        console.error('Firebase Function Error:', error.response ? error.response.data : error.message);
        vscode.window.showErrorMessage('Failed to communicate with the analysis service. Check the debug console.');
        return null;
    }
}

function applyDecorations(editor, issues) {
    const criticalDecorations = [];
    const warningDecorations = [];
    const suggestionDecorations = [];

    const severityMap = {
        "Critical": { decorations: criticalDecorations },
        "Warning": { decorations: warningDecorations },
        "Suggestion": { decorations: suggestionDecorations }
    };

    for (const item of issues) {

        let foundLineIndex = -1;
        const aiLine = item.line - 1;


        if (aiLine >= 0 && aiLine < editor.document.lineCount && item.codeSnippet) {
            const lineText = editor.document.lineAt(aiLine).text.trim();

            if (lineText.includes(item.codeSnippet.trim()) || item.codeSnippet.trim().includes(lineText)) {
                foundLineIndex = aiLine;
            }
        }

        if (foundLineIndex === -1 && item.codeSnippet) {
             for (let i = 0; i < editor.document.lineCount; i++) {
                const lineText = editor.document.lineAt(i).text;
                if (lineText.trim() === item.codeSnippet.trim()) {
                    foundLineIndex = i;
                    break;
                }
            }
        }

        if (foundLineIndex === -1) {
            console.warn(`Could not reliably find line for issue: "${item.issue}"`);
            continue;
        }

        const line = editor.document.lineAt(foundLineIndex);
        const range = new vscode.Range(foundLineIndex, line.firstNonWhitespaceCharacterIndex, foundLineIndex, line.range.end.character);
        
        const severityInfo = severityMap[item.severity] || severityMap["Suggestion"];

        const decoration = {
            range,
            hoverMessage: `**${item.severity} Issue:**\n\n${item.issue}\n\n---\n\n**සිංහල පරිවර්තනය:**\n\n${item.sinhalaIssue}`,
            renderOptions: {
                after: {
                    contentText: `(L${foundLineIndex + 1}) ${item.sinhalaIssue}`
                }
            }
        };
        severityInfo.decorations.push(decoration);
    }

    editor.setDecorations(criticalDecorationType, criticalDecorations);
    editor.setDecorations(warningDecorationType, warningDecorations);
    editor.setDecorations(suggestionDecorationType, suggestionDecorations);
}


function createSummary(issues) {
    const counts = { Critical: 0, Warning: 0, Suggestion: 0 };
    for (const issue of issues) {
        if (counts[issue.severity] !== undefined) {
            counts[issue.severity]++;
        }
    }
    const parts = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([severity, count]) => `${count} ${severity}`);

    return `Analysis Complete: Found ${parts.join(', ')}.`;
}

function deactivate() {}

module.exports = { activate, deactivate };

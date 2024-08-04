const vscode = require('vscode');
const axios = require('axios'); // Import axios for HTTP requests

const translationCache = {}; // Cache for translations

async function activate(context) {
  try {
    // Register the event listener for active text editor changes
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        const result = await vscode.window.showInformationMessage('Do you want to translate To Sinhala?', 'Yes', 'No');
        if (result === 'Yes') {
          await performTranslation();
        }
      }
    });

    // Register the command that can be invoked via the command palette or context menu
    let disposable = vscode.commands.registerCommand('translate-to-sinhala.translateToSinhala', async () => {
      await performTranslation();
    });

    context.subscriptions.push(disposable);
  } catch (error) {
    console.error('Error during activation:', error);
    vscode.window.showErrorMessage('Failed to fetch translation.');
  }
}

exports.activate = activate;

async function performTranslation() {
  // Pre-fetch translations for common messages
  const messages = [
    'Keep lines of code to a maximum of 80-100 characters',
    ' ← Function should not start with spaces',
    ' ← Variable names should be in camelCase',
    'Comment : ',
    ' ← Remove unwanted space'
  ];

  // Fetch translations for each message
  for (const message of messages) {
    translationCache[message] = await getTranslatedText(message, 'en', 'si');
  }

  // Run codeInspect with the translated text
  codeInspect(translationCache);
}

async function codeInspect(translations) {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const document = editor.document;
    const text = document.getText();
    const lines = text.split('\n');

    // Create decoration types for lines exceeding 80 and 100 characters
    const decorationType80 = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255,165,0,0.3)', // Orange background for 80-100 characters
      after: {
        contentText: ` ← ${translations['Keep lines of code to a maximum of 80-100 characters']}`,
        color: 'rgba(255,165,0,1)',
        margin: '0 0 0 20px'
      }
    });
    const decorationType100 = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255,0,0,0.3)', // Red background for >100 characters
      after: {
        contentText: ` ← ${translations['Keep lines of code to a maximum of 80-100 characters']}`,
        color: 'rgba(255,0,0,1)',
        margin: '0 0 0 20px'
      }
    });

    // Create a decoration type for function definitions with leading spaces
    const decorationTypeFunction = vscode.window.createTextEditorDecorationType({
      borderWidth: '2px',
      borderStyle: 'solid',
      borderColor: 'rgba(0,0,255,0.5)', // Blue border for leading spaces before function definitions
      after: {
        contentText: ` ← ${translations[' ← Function should not start with spaces']}`,
        color: 'rgba(0,0,255,1)',
        margin: '0 0 0 20px'
      }
    });

    // Create a decoration type for improper variable names
    const decorationTypeVariable = vscode.window.createTextEditorDecorationType({
      borderWidth: '2px',
      borderStyle: 'dotted',
      borderColor: 'rgba(255,0,255,0.5)', // Pink border for improper variable names
      after: {
        contentText: ` ← ${translations[' ← Variable names should be in camelCase']}`,
        color: 'rgba(255,0,255,1)',
        margin: '0 0 0 20px'
      }
    });

    // Create a decoration type for translated comments
    const decorationTypeComment = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(0,255,0,0.2)', // Light green background for translated comments
      after: {
        contentText: ` ← ${translations['Comment : ']}`,
        color: 'rgba(0,255,0,1)',
        margin: '0 0 0 20px'
      }
    });

    // Create a decoration type for unwanted spaces
    const decorationTypeUnwantedSpace = vscode.window.createTextEditorDecorationType({
      borderWidth: '2px',
      borderStyle: 'solid',
      borderColor: 'rgba(255,69,0,0.5)', // OrangeRed border for unwanted spaces
      after: {
        contentText: ` ← ${translations[' ← Remove unwanted space']}`,
        color: 'rgba(255,69,0,1)',
        margin: '0 0 0 20px'
      }
    });

    const decorations80 = [];
    const decorations100 = [];
    const decorationFunctions = [];
    const decorationVariables = [];
    const decorationComments = [];
    const decorationUnwantedSpaces = [];

    // Regular expressions for function definitions in various languages
    const functionRegexes = [
      /^\s*function\s/,         // JavaScript, PHP
      /^\s*def\s/,              // Python
      /^\s*(public|private|protected)?\s*(static\s+)?\w+\s+\w+\s*\(.*\)\s*\{/, // Java, C#
      /^\s*func\s+/             // Go
    ];

    // Regular expression for variable names
    const variableRegex = /\b(?:var|let|const|int|String|boolean|double|float|char|long)\s+([A-Z_][\w]*)/g;

    // Regular expression for comment lines
    const commentRegexes = [
      /\/\/.*/,   // JavaScript, Java, Go
      /#.*/,      // Python, Ruby
      /\/\*[\s\S]*?\*\//, // Java, JavaScript
      /\/\*\*[\s\S]*?\*\// // JavaDoc
    ];

    lines.forEach((line, index) => {
      if (line.length > 100) {
        const startPos = new vscode.Position(index, 0);
        const endPos = new vscode.Position(index, line.length);
        const decoration = { range: new vscode.Range(startPos, endPos) };
        decorations100.push(decoration);

      } else if (line.length > 80) {
        const startPos = new vscode.Position(index, 0);
        const endPos = new vscode.Position(index, line.length);
        const decoration = { range: new vscode.Range(startPos, endPos) };
        decorations80.push(decoration);
      }

      // Check for function definitions with leading spaces
      for (const regex of functionRegexes) {
        if (regex.test(line)) {
          const leadingSpaces = line.match(/^\s*/)[0];
          if (leadingSpaces.length > 0) {
            const startPos = new vscode.Position(index, 0);
            const endPos = new vscode.Position(index, line.length);
            const decoration = { range: new vscode.Range(startPos, endPos) };
            decorationFunctions.push(decoration);
            break;
          }
        }
      }

      // Check for improper variable names
      let match;
      while ((match = variableRegex.exec(line)) !== null) {
        const startPos = new vscode.Position(index, match.index);
        const endPos = new vscode.Position(index, match.index + match[0].length);
        const decoration = { range: new vscode.Range(startPos, endPos) };
        decorationVariables.push(decoration);
      }

      // Check for comment lines and translate them
      for (const regex of commentRegexes) {
        if (regex.test(line)) {
          const startPos = new vscode.Position(index, 0);
          const endPos = new vscode.Position(index, line.length);
          const decoration = { range: new vscode.Range(startPos, endPos) };
          decorationComments.push(decoration);
          translateAndShowComment(line, index, translations);
          break;
        }
      }



// Check for trailing spaces
if (line.match(/\s{2,}$/)) {
  const trailingSpaces = line.match(/\s{2,}$/)[0];
  const startPos = new vscode.Position(index, line.length - trailingSpaces.length);
  const endPos = new vscode.Position(index, line.length);
  const decoration = { range: new vscode.Range(startPos, endPos) };
  decorationUnwantedSpaces.push(decoration);
}
    });

    // Apply decorations
    editor.setDecorations(decorationType80, decorations80);
    editor.setDecorations(decorationType100, decorations100);
    editor.setDecorations(decorationTypeFunction, decorationFunctions);
    editor.setDecorations(decorationTypeVariable, decorationVariables);
    editor.setDecorations(decorationTypeComment, decorationComments);
    editor.setDecorations(decorationTypeUnwantedSpace, decorationUnwantedSpaces);
  }
}

async function translateAndShowComment(commentLine, lineIndex, translations) {
  const translatedComment = await getTranslatedText(commentLine, 'en', 'si');
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const startPos = new vscode.Position(lineIndex, 0);
    const endPos = new vscode.Position(lineIndex, commentLine.length);
    const decoration = {
      range: new vscode.Range(startPos, endPos),
      hoverMessage: translatedComment
    };
    // Apply decoration with translated comment as hover message
    editor.setDecorations(
      vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(0,255,0,0.2)', // Light green background for translated comments
        after: {
          contentText: ` ← ${translations['Comment : ']}${translatedComment}`,
          color: 'rgba(0,255,0,1)',
          margin: '0 0 0 20px'
        }
      }),
      [decoration]
    );
  }
}

async function getTranslatedText(textToTranslate, sourceLanguage, targetLanguage) {
  if (translationCache[textToTranslate]) {
    return translationCache[textToTranslate];
  }

  const translationAPI = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=${sourceLanguage}|${targetLanguage}`;
  try {
    const response = await axios.get(translationAPI);
    const translatedText = response.data.responseData.translatedText;
    translationCache[textToTranslate] = translatedText;
    return translatedText;
  } catch (error) {
    console.error('Error fetching translation:', error);
    return textToTranslate; // Fallback to the original text in case of an error
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

const vscode = require("vscode");
const axios = require("axios");

let translationDisposable;

function activate(context) {
  translationDisposable = vscode.commands.registerCommand(
    "translate-to-sinhala.translateToSinhala",
    async function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      const document = editor.document;
      const selection = editor.selection;

      const selectedText = editor.document.getText(selection);

      const lines = selectedText.split("\n");

      for (const line of lines) {
        const commentIndex = line.indexOf("//");

        if (commentIndex !== -1) {
          const textToTranslate = line.substring(commentIndex + 2).trim();

          const sourceLanguage = "en";
          const targetLanguage = "si";
          const translationAPI = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
            textToTranslate
          )}&langpair=${sourceLanguage}|${targetLanguage}`;

          try {
            const response = await axios.get(translationAPI);
            const translatedText = response.data.responseData.translatedText;

            const newText =
              line.substring(0, commentIndex + 2) + translatedText;

            await editor.edit((editBuilder) => {
              editBuilder.replace(
                document.lineAt(selection.start.line).range,
                newText
              );
            });

            vscode.window.showInformationMessage("Text translated to Sinhala.");
          } catch (error) {
            console.error("Translation error:", error);
            vscode.window.showErrorMessage("Failed to translate text.");
            return;
          }
        }
      }
    }
  );

  context.subscriptions.push(translationDisposable);
}

function deactivate() {
  translationDisposable.dispose();
}

module.exports = {
  activate,
  deactivate,
};

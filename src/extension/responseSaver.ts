import * as vscode from 'vscode';

export async function saveResponseBody(body: string, extension: string): Promise<void> {
  const defaultUri = vscode.Uri.file(`response.${extension}`);
  const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'Response body': [extension], 'All files': ['*'] } });
  if (target) {
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(body));
  }
}

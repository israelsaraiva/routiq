import * as vscode from 'vscode';

function createNonce(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, view?: string): string {
  const nonce = createNonce();
  const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', name));
  const policy = `default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'`;
  const viewAttribute = view ? ` data-view="${view}"` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<link rel="stylesheet" href="${asset('webview.css')}">
</head>
<body>
<div id="root"${viewAttribute}></div>
<script nonce="${nonce}" src="${asset('webview.js')}"></script>
</body>
</html>`;
}

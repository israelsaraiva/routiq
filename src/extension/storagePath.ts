import * as path from 'path';
import * as vscode from 'vscode';

const DEFAULT_DIRECTORY_NAME = 'collections';

export function resolveStorageDirectory(globalStorageDirectory: string): string {
  const configured = vscode.workspace.getConfiguration('routiq').get<string>('storagePath', '').trim();
  if (!configured) {
    return path.join(globalStorageDirectory, DEFAULT_DIRECTORY_NAME);
  }
  if (path.isAbsolute(configured)) {
    return configured;
  }
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder
    ? path.join(workspaceFolder.uri.fsPath, configured)
    : path.join(globalStorageDirectory, DEFAULT_DIRECTORY_NAME);
}

import * as vscode from 'vscode';

export async function pickFile(): Promise<string | undefined> {
  const [selected] =
    (await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFolders: false, openLabel: 'Select file' })) ?? [];
  return selected?.fsPath;
}

export async function pickProtoFile(): Promise<string | undefined> {
  const [selected] =
    (await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFolders: false,
      filters: { 'Protocol Buffers': ['proto'] },
      openLabel: 'Select .proto file',
    })) ?? [];
  return selected?.fsPath;
}

export async function pickImportFolder(): Promise<string | undefined> {
  const [selected] =
    (await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFiles: false, canSelectFolders: true, openLabel: 'Select import path' })) ?? [];
  return selected?.fsPath;
}

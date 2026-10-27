import * as vscode from 'vscode';
import { AutoSaveSettings, normalizeAutoSaveSettings } from '../core/autoSave';

export function readAutoSaveSettings(): AutoSaveSettings {
  const settings = vscode.workspace.getConfiguration('routiq');
  return normalizeAutoSaveSettings(settings.get('autoSave'), settings.get('autoSaveDelayMs'));
}

export function onDidChangeAutoSaveSettings(listener: (settings: AutoSaveSettings) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('routiq.autoSave') || event.affectsConfiguration('routiq.autoSaveDelayMs')) {
      listener(readAutoSaveSettings());
    }
  });
}

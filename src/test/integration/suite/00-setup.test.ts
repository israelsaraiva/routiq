import * as vscode from 'vscode';
import { join } from 'node:path';
import { EXTENSION_ID } from '../extensionInfo';
import { scratchRoot } from '../scratch';

const CONFIGURED_STORAGE_DIRECTORY = 'configured-storage';

before(async () => {
  const storagePath = join(scratchRoot(), CONFIGURED_STORAGE_DIRECTORY);
  await vscode.workspace.getConfiguration('routiq').update('storagePath', storagePath, vscode.ConfigurationTarget.Global);
  await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
});

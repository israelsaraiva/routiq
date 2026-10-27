import * as vscode from 'vscode';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Storage } from '../../extension/storage';
import { createScratchDirectory } from './scratch';

export interface StorageHarness {
  storage: Storage;
  directory: string;
  globalStorage: string;
}

export async function useStoragePath(storagePath: string): Promise<void> {
  await vscode.workspace.getConfiguration('routiq').update('storagePath', storagePath, vscode.ConfigurationTarget.Global);
}

export async function createStorageHarness(prefix: string): Promise<StorageHarness> {
  const root = createScratchDirectory(prefix);
  const directory = join(root, 'collections');
  const globalStorage = join(root, 'global');
  await useStoragePath(directory);
  const storage = new Storage(globalStorage);
  await storage.init();
  return { storage, directory, globalStorage };
}

export function collectionFiles(directory: string): string[] {
  return readdirSync(directory).filter((name) => name.endsWith('.json'));
}

export function readCollectionFile(directory: string, fileName: string): string {
  return readFileSync(join(directory, fileName), 'utf8');
}

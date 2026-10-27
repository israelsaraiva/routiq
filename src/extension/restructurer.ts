import * as vscode from 'vscode';
import { NestDestination, nestCollection } from '../core/restructure';
import { SecretVault } from './secretVault';
import { Storage } from './storage';

export class CollectionRestructurer {
  constructor(private readonly storage: Storage, private readonly vault: SecretVault) {}

  async nestCollection(collectionId: string, destination: NestDestination): Promise<void> {
    const source = this.storage.getCollection(collectionId);
    const target = this.storage.getCollection(destination.collectionId);
    if (!source || !target) {
      return;
    }
    const result = nestCollection(this.storage.getCollections(), collectionId, destination);
    if (!result) {
      return;
    }
    await this.vault.load([source]);
    await this.vault.moveSecrets(collectionId, destination.collectionId, result.secretMoves);
    this.storage.applyNest(result);
    this.reportNested(source.name, target.name, result.warnings);
  }

  promoteFolder(folderId: string): void {
    const promoted = this.storage.promoteFolder(folderId);
    promoted && vscode.window.showInformationMessage(`"${promoted.name}" is now a collection.`);
  }

  private reportNested(sourceName: string, targetName: string, warnings: string[]): void {
    const message = `"${sourceName}" moved into "${targetName}" as a folder.`;
    if (warnings.length === 0) {
      vscode.window.showInformationMessage(message);
      return;
    }
    vscode.window.showWarningMessage(`${message} Not carried over: ${warnings.join(' ')} Cookies of the old collection are not kept.`);
  }
}

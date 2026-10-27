import * as vscode from 'vscode';
import { EnvironmentsDraft, HostToWebviewMessage, WebviewToHostMessage } from '../shared/types';
import { stripDraftSecrets } from '../core/secrets';
import { SecretVault } from './secretVault';
import { Storage } from './storage';
import { renderWebviewHtml } from './webviewHtml';

export class EnvironmentPanels implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: Storage,
    private readonly vault: SecretVault,
  ) {}

  open(collectionId: string): void {
    const collection = this.storage.getCollection(collectionId);
    if (!collection) {
      return;
    }
    const existing = this.panels.get(collectionId);
    if (existing) {
      existing.reveal();
      return;
    }
    this.panels.set(collectionId, this.createPanel(collectionId, collection.name));
  }

  dispose(): void {
    [...this.panels.values()].forEach((panel) => panel.dispose());
  }

  private createPanel(collectionId: string, collectionName: string): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel('routiq.environments', `Environments — ${collectionName}`, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    });
    panel.webview.html = renderWebviewHtml(panel.webview, this.extensionUri, 'environments');
    panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => this.handleMessage(collectionId, panel, message));
    panel.onDidDispose(() => this.panels.delete(collectionId));
    return panel;
  }

  private handleMessage(collectionId: string, panel: vscode.WebviewPanel, message: WebviewToHostMessage): void {
    if (message.type === 'ready') {
      void this.postDraft(collectionId, panel);
    } else if (message.type === 'saveEnvironments') {
      const { type: _type, ...draft } = message;
      void this.save(collectionId, panel, draft);
    }
  }

  private async save(collectionId: string, panel: vscode.WebviewPanel, draft: EnvironmentsDraft): Promise<void> {
    const collection = this.storage.getCollection(collectionId);
    if (!collection) {
      return;
    }
    await this.vault.saveDraft(collection, draft);
    this.storage.applyEnvironmentsDraft(collectionId, stripDraftSecrets(draft));
    post(panel, { type: 'saved' });
  }

  private async postDraft(collectionId: string, panel: vscode.WebviewPanel): Promise<void> {
    const collection = this.storage.getCollection(collectionId);
    if (collection) {
      const draft: EnvironmentsDraft = {
        variables: collection.variables,
        environments: collection.environments,
        activeEnvironmentId: collection.activeEnvironmentId,
      };
      post(panel, { type: 'environmentsLoad', collectionName: collection.name, draft: await this.vault.hydrateDraft(collectionId, draft) });
    }
  }
}

function post(panel: vscode.WebviewPanel, message: HostToWebviewMessage): void {
  void panel.webview.postMessage(message);
}

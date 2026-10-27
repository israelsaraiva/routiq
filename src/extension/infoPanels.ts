import * as vscode from 'vscode';
import { feedbackMailto, parseAuthor } from '../core/author';
import { formatDiagnostics } from '../core/diagnostics';
import { collectInfoLinks } from '../core/infoLinks';
import { InfoHostMessage, InfoLink, InfoView, InfoWebviewMessage } from '../core/infoMessages';
import { collectAboutInfo, snapshotSettings } from './aboutInfo';
import { Storage } from './storage';
import { renderWebviewHtml } from './webviewHtml';

const PANEL_TITLES: Record<InfoView, string> = { help: 'Routiq Help', about: 'About Routiq' };

export class InfoPanels implements vscode.Disposable {
  private readonly panels = new Map<InfoView, vscode.WebviewPanel>();

  constructor(
    private readonly extension: vscode.Extension<unknown>,
    private readonly storage: Storage,
  ) {}

  open(view: InfoView): void {
    const existing = this.panels.get(view);
    if (existing) {
      existing.reveal();
      return;
    }
    this.panels.set(view, this.createPanel(view));
  }

  dispose(): void {
    [...this.panels.values()].forEach((panel) => panel.dispose());
  }

  private get links(): InfoLink[] {
    return collectInfoLinks(this.extension.packageJSON);
  }

  private createPanel(view: InfoView): vscode.WebviewPanel {
    const extensionUri = this.extension.extensionUri;
    const panel = vscode.window.createWebviewPanel(`routiq.${view}`, PANEL_TITLES[view], vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
    });
    panel.webview.html = renderWebviewHtml(panel.webview, extensionUri, view);
    panel.webview.onDidReceiveMessage((message: InfoWebviewMessage) => void this.handleMessage(panel, message));
    panel.onDidDispose(() => this.panels.delete(view));
    return panel;
  }

  private async handleMessage(panel: vscode.WebviewPanel, message: InfoWebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        return this.postInfo(panel);
      case 'openSettings':
        return void (await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.extension.id}`));
      case 'openReadme':
        return void (await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.joinPath(this.extension.extensionUri, 'README.md')));
      case 'openLink':
        return this.openLink(message.url);
      case 'contactAuthor':
        return this.contactAuthor();
      case 'revealStorage':
        return void (await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.storage.directory)));
      case 'copyStoragePath':
        return this.copy(this.storage.directory, 'Storage path copied');
      case 'copyDiagnostics':
        return this.copy(this.diagnostics(), 'Diagnostics copied');
    }
  }

  private postInfo(panel: vscode.WebviewPanel): void {
    const message: InfoHostMessage = { type: 'infoLoad', about: collectAboutInfo(this.extension, this.storage), links: this.links };
    void panel.webview.postMessage(message);
  }

  private async openLink(url: string): Promise<void> {
    if (this.links.some((link) => link.url === url)) {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }

  private async contactAuthor(): Promise<void> {
    const { name, version } = this.extension.packageJSON;
    const mailto = feedbackMailto(parseAuthor(this.extension.packageJSON.author), name, version);
    if (mailto) {
      await vscode.env.openExternal(vscode.Uri.parse(mailto));
    }
  }

  private diagnostics(): string {
    return formatDiagnostics(collectAboutInfo(this.extension, this.storage), process.platform, snapshotSettings(this.extension));
  }

  private async copy(text: string, confirmation: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
    void vscode.window.setStatusBarMessage(confirmation, 3000);
  }
}

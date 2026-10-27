import * as vscode from 'vscode';
import { formatReport } from '../core/networkDiagnosis';
import { PreparedRequest } from '../core/requestBuilder';
import { DiagnosisEnvironment, diagnoseNetwork } from './networkDiagnoser';
import { defaultTimeoutMs, readNetworkSettings } from './networkSettings';

export interface DiagnosisTarget {
  template: string;
  prepared: PreparedRequest;
  timeoutMs?: number;
}

type PanelMessage = { type: 'copy' } | { type: 'run'; useRealRequest: boolean };

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createNonce(): string {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

export function renderReportHtml(report: string, useRealRequest: boolean, running: boolean): string {
  const nonce = createNonce();
  const policy = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'`;
  const disabled = running ? ' disabled' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<style nonce="${nonce}">
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
.actions { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 4px 12px; cursor: pointer; }
pre { font-family: var(--vscode-editor-font-family); white-space: pre-wrap; }
</style>
</head>
<body>
<div class="actions">
<button id="copy"${disabled}>Copy report</button>
<button id="run"${disabled}>Run again</button>
<label><input type="checkbox" id="real"${useRealRequest ? ' checked' : ''}${disabled}> Use the real method and body</label>
</div>
<pre id="report">${escapeHtml(report)}</pre>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ type: 'copy' }));
document.getElementById('run').addEventListener('click', () => vscode.postMessage({ type: 'run', useRealRequest: document.getElementById('real').checked }));
</script>
</body>
</html>`;
}

function readEnvironment(targetUrl: string, requestTimeoutMs: number | undefined): DiagnosisEnvironment {
  const routiq = vscode.workspace.getConfiguration('routiq');
  const http = vscode.workspace.getConfiguration('http');
  const network = readNetworkSettings(targetUrl);
  return {
    network,
    timeoutMs: requestTimeoutMs && requestTimeoutMs > 0 ? requestTimeoutMs : defaultTimeoutMs(),
    platform: process.platform,
    proxy: {
      routiqProxy: routiq.get<string>('proxy', ''),
      vscodeProxy: http.get<string>('proxy', ''),
      proxySupport: http.get<string>('proxySupport', 'override'),
      useVsCodeNetworkingSetting: routiq.get<boolean>('useVsCodeNetworking', true),
      env: process.env,
    },
  };
}

export class NetworkDiagnosisPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private lastReport = '';

  dispose(): void {
    this.panel?.dispose();
  }

  async show(target: DiagnosisTarget): Promise<void> {
    const panel = this.ensurePanel(target);
    panel.reveal();
    await this.run(panel, target, false);
  }

  private ensurePanel(target: DiagnosisTarget): vscode.WebviewPanel {
    this.panel?.dispose();
    const panel = vscode.window.createWebviewPanel('routiq.networkDiagnosis', 'Routiq: Network Diagnosis', vscode.ViewColumn.Beside, { enableScripts: true });
    panel.webview.onDidReceiveMessage((message: PanelMessage) => void this.handleMessage(panel, target, message));
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel = panel;
    return panel;
  }

  private async handleMessage(panel: vscode.WebviewPanel, target: DiagnosisTarget, message: PanelMessage): Promise<void> {
    if (message.type === 'copy') {
      await vscode.env.clipboard.writeText(this.lastReport);
      void vscode.window.showInformationMessage('Network diagnosis report copied.');
    } else {
      await this.run(panel, target, message.useRealRequest);
    }
  }

  private async run(panel: vscode.WebviewPanel, target: DiagnosisTarget, useRealRequest: boolean): Promise<void> {
    panel.webview.html = renderReportHtml('Running checks…', useRealRequest, true);
    const environment = readEnvironment(target.prepared.url, target.timeoutMs);
    const report = await diagnoseNetwork({ url: { template: target.template, resolved: target.prepared.url }, prepared: target.prepared, useRealRequest }, environment);
    this.lastReport = formatReport(report);
    panel.webview.html = renderReportHtml(this.lastReport, useRealRequest, false);
  }
}

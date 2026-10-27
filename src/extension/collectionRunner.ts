import * as vscode from 'vscode';
import {
  GRPC_RUN_MESSAGE_CAP, RequestRunResult, RunSummary, RunnableRequest, buildGrpcRunResult, buildRunExport, buildRunResult, buildSkippedResult, collectRunnableRequests,
  normalizeDelayMs, summarizeRun,
} from '../core/collectionRunner';
import { resolveCollectionVariables } from '../core/environments';
import { prepareGrpcCall } from '../core/grpcPreparation';
import { RunnerHostMessage, RunnerWebviewMessage } from '../core/runnerMessages';
import { PreparedRequest, prepareRequest } from '../core/requestBuilder';
import { RequestModel, ResponseModel, ScriptsOutcome } from '../shared/types';
import { CookieStore } from './cookieStore';
import { runGrpcCall } from './grpcRunner';
import { buildSendOptions } from './networkSettings';
import { obtainAuthorization } from './oauthTokens';
import { ScriptPermission } from './scriptConsent';
import { ScriptedSender } from './scriptedSender';
import { SecretVault } from './secretVault';
import { Storage } from './storage';
import { renderWebviewHtml } from './webviewHtml';

const NO_SCRIPT_OUTCOME: ScriptsOutcome = { tests: [], console: [], errors: [] };

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failedResponse(message: string): ResponseModel {
  return { status: 0, statusText: '', timeMs: 0, sizeBytes: 0, headers: [], body: '', error: message };
}

async function prepareWithOAuth(request: RequestModel, variables: Record<string, string>, timeoutMs: number): Promise<PreparedRequest> {
  if (request.auth.type !== 'oauth2') {
    return prepareRequest(request, variables);
  }
  try {
    const oauthAuthorization = await obtainAuthorization(request.auth, variables, timeoutMs);
    return prepareRequest(request, variables, { oauthAuthorization });
  } catch {
    return prepareRequest(request, variables);
  }
}

class RunControl {
  private stopped = false;
  private readonly controller = new AbortController();
  private wake: (() => void) | undefined;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  stop(): void {
    this.stopped = true;
    this.controller.abort();
    this.wake?.();
  }

  sleep(delayMs: number): Promise<void> {
    if (delayMs <= 0 || this.stopped) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, delayMs);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

interface RunTarget {
  collectionId: string;
  name: string;
  items: Parameters<typeof collectRunnableRequests>[0];
}

interface RunSession {
  panel: vscode.WebviewPanel;
  control: RunControl;
  ready: Promise<void>;
  results: RequestRunResult[];
  summary?: RunSummary;
  title: string;
}

export class CollectionRunner {
  private readonly sender: ScriptedSender;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: Storage,
    cookies: CookieStore,
    private readonly vault: SecretVault,
    scriptPermission?: ScriptPermission,
  ) {
    this.sender = new ScriptedSender(storage, cookies, vault, scriptPermission);
  }

  async run(collectionId: string, folderId?: string): Promise<void> {
    const target = this.resolveTarget(collectionId, folderId);
    if (!target) {
      return;
    }
    const runnable = collectRunnableRequests(target.items);
    if (runnable.length === 0) {
      void vscode.window.showInformationMessage('Routiq: nothing to run — no requests found.');
      return;
    }
    const session = this.openSession(target.name);
    await session.ready;
    const delayMs = normalizeDelayMs(vscode.workspace.getConfiguration('routiq').get<number>('runner.delayMs', 0));
    post(session.panel, { type: 'start', title: session.title, total: runnable.length, delayMs });
    const startedAt = Date.now();
    await this.runSequentially(runnable, delayMs, session, target.collectionId);
    session.summary = summarizeRun(session.results, runnable.length, session.control.isStopped, Date.now() - startedAt);
    post(session.panel, { type: 'done', summary: session.summary });
  }

  private resolveTarget(collectionId: string, folderId?: string): RunTarget | undefined {
    const collection = this.storage.getCollection(collectionId);
    if (!collection) {
      return undefined;
    }
    const folder = folderId ? this.storage.findFolder(folderId)?.folder : undefined;
    return folder
      ? { collectionId, name: `${collection.name} / ${folder.name}`, items: folder.items }
      : { collectionId, name: collection.name, items: collection.items };
  }

  private openSession(name: string): RunSession {
    const title = `Run — ${name}`;
    const control = new RunControl();
    const panel = vscode.window.createWebviewPanel('routiq.runner', title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    });
    panel.webview.html = renderWebviewHtml(panel.webview, this.extensionUri, 'runner');
    const session: RunSession = { panel, control, title, results: [], ready: Promise.resolve() };
    session.ready = new Promise<void>((resolve) => {
      panel.webview.onDidReceiveMessage((message: RunnerWebviewMessage) => this.handleMessage(session, message, resolve));
      panel.onDidDispose(resolve);
    });
    panel.onDidDispose(() => control.stop());
    return session;
  }

  private handleMessage(session: RunSession, message: RunnerWebviewMessage, markReady: () => void): void {
    if (message.type === 'ready') {
      markReady();
    } else if (message.type === 'stop') {
      session.control.stop();
    } else if (message.type === 'export') {
      void this.exportResults(session);
    }
  }

  private async exportResults(session: RunSession): Promise<void> {
    if (!session.summary) {
      return;
    }
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('routiq-run.json'), filters: { JSON: ['json'] } });
    if (!target) {
      return;
    }
    const content = JSON.stringify(buildRunExport(session.title, session.summary, session.results, new Date()), null, 2);
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
    void vscode.window.showInformationMessage(`Routiq: run results exported to ${target.fsPath}`);
  }

  private async runSequentially(runnable: RunnableRequest[], delayMs: number, session: RunSession, collectionId: string): Promise<void> {
    const { control, panel } = session;
    for (const [index, item] of runnable.entries()) {
      if (control.isStopped) {
        break;
      }
      const result = await this.runOne(item, control.signal, collectionId);
      session.results.push(result);
      post(panel, { type: 'result', index, result });
      if (index < runnable.length - 1 && result.mode !== 'skipped') {
        await control.sleep(delayMs);
      }
    }
  }

  private runOne(item: RunnableRequest, signal: AbortSignal, collectionId: string): Promise<RequestRunResult> {
    if (item.mode === 'skipped') {
      return Promise.resolve(buildSkippedResult(item));
    }
    return item.mode === 'grpc' ? this.runGrpc(item, signal, collectionId) : this.runHttp(item, signal);
  }

  private async runGrpc(item: RunnableRequest, signal: AbortSignal, collectionId: string): Promise<RequestRunResult> {
    const request = this.storage.findRequest(item.request.id)?.request ?? item.request;
    try {
      const collection = this.storage.getCollection(collectionId);
      await this.vault.load(collection ? [collection] : []);
      const variables = collection ? resolveCollectionVariables(this.vault.hydrate(collection)) : {};
      const prepared = prepareGrpcCall(request, variables);
      const { network, timeoutMs } = buildSendOptions(`https://${prepared.target}`, request.timeoutMs);
      const outcome = await runGrpcCall(prepared, { rejectUnauthorized: network.rejectUnauthorized }, { maxMessages: GRPC_RUN_MESSAGE_CAP, timeoutMs, signal });
      return buildGrpcRunResult(item, outcome);
    } catch (error) {
      return buildRunResult(item, failedResponse(describeFailure(error)), NO_SCRIPT_OUTCOME);
    }
  }

  private async runHttp(item: RunnableRequest, signal: AbortSignal): Promise<RequestRunResult> {
    const request = this.storage.findRequest(item.request.id)?.request ?? item.request;
    try {
      const { response } = await this.sender.send(request.id, request, prepareWithOAuth, signal);
      return buildRunResult(item, response, response.scripts ?? NO_SCRIPT_OUTCOME);
    } catch (error) {
      return buildRunResult(item, failedResponse(describeFailure(error)), NO_SCRIPT_OUTCOME);
    }
  }
}

function post(panel: vscode.WebviewPanel, message: RunnerHostMessage): void {
  try {
    void panel.webview.postMessage(message);
  } catch {
    return;
  }
}

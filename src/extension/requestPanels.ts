import * as vscode from 'vscode';
import { createHistoryEntry, createStreamHistoryEntry, toSummary } from '../core/history';
import { StreamRecording } from '../core/streamRecording';
import { substituteVariables } from '../core/variables';
import { generateId } from '../core/ids';
import { PreparedRequest, prepareRequest } from '../core/requestBuilder';
import { resolveCollectionVariables, summarizeEnvironments } from '../core/environments';
import { collectVariableSuggestions } from '../core/variableSuggestions';
import { GraphqlSchemaSummary, HostToWebviewMessage, RequestModel, ResponseModel, WebviewToHostMessage } from '../shared/types';
import { onDidChangeAutoSaveSettings, readAutoSaveSettings } from './autoSaveSettings';
import { copyRequestAsCurl } from './curlCommands';
import { CookieStore } from './cookieStore';
import { NetworkDiagnosisPanel } from './networkDiagnosisPanel';
import { buildSendOptions, defaultTimeoutMs } from './networkSettings';
import { describeToken, obtainAuthorization, obtainToken } from './oauthTokens';
import { HistoryStore } from './historyStore';
import { pickFile, pickImportFolder, pickProtoFile } from './filePicker';
import { describeGrpcServices } from './grpcClient';
import { prepareGrpcCall } from '../core/grpcPreparation';
import { createIntrospectionRequest, parseIntrospectionResponse } from '../core/graphql/introspection';
import { CachedSchema, GraphqlSchemaStore } from './graphqlSchemaStore';
import { saveResponseBody } from './responseSaver';
import { ScriptPermission } from './scriptConsent';
import { ScriptedSender } from './scriptedSender';
import { SecretVault } from './secretVault';
import { Storage } from './storage';
import { CookieSession } from './httpClient';
import { StreamSession } from './streamSession';
import { renderWebviewHtml } from './webviewHtml';

export class RequestPanels implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly streams = new Map<string, StreamSession>();
  private readonly subscription: vscode.Disposable;
  private readonly autoSaveSubscription: vscode.Disposable;
  private readonly scriptedSender: ScriptedSender;
  private readonly focusEmitter = new vscode.EventEmitter<string>();
  readonly onDidFocusCollection = this.focusEmitter.event;
  private readonly requestFocusEmitter = new vscode.EventEmitter<string>();
  readonly onDidFocusRequest = this.requestFocusEmitter.event;
  private focusedRequestId: string | undefined;
  private readonly networkDiagnosis = new NetworkDiagnosisPanel();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: Storage,
    private readonly history: HistoryStore,
    private readonly cookies: CookieStore,
    private readonly vault: SecretVault,
    private readonly graphqlSchemas?: GraphqlSchemaStore,
    scriptPermission?: ScriptPermission,
  ) {
    this.scriptedSender = new ScriptedSender(storage, cookies, vault, scriptPermission);
    this.subscription = storage.onDidChange(() => this.syncPanelsWithStorage());
    this.autoSaveSubscription = onDidChangeAutoSaveSettings(() => this.panels.forEach((panel) => postAutoSaveSettings(panel)));
  }

  open(requestId: string): void {
    const location = this.storage.findRequest(requestId);
    if (!location) {
      return;
    }
    const existing = this.panels.get(requestId);
    if (existing) {
      existing.reveal();
      this.announceFocus(requestId);
      return;
    }
    this.panels.set(requestId, this.createPanel(location.request));
    this.announceFocus(requestId);
  }

  dispose(): void {
    this.subscription.dispose();
    this.autoSaveSubscription.dispose();
    this.focusEmitter.dispose();
    this.requestFocusEmitter.dispose();
    this.networkDiagnosis.dispose();
    [...this.panels.values()].forEach((panel) => panel.dispose());
    [...this.streams.values()].forEach((session) => session.dispose());
  }

  private createPanel(request: RequestModel): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel('routiq.request', request.name, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    });
    panel.webview.html = renderWebviewHtml(panel.webview, this.extensionUri);
    panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => this.handleMessage(request.id, panel, message));
    panel.onDidChangeViewState((event) => event.webviewPanel.active && this.announceFocus(request.id));
    panel.onDidDispose(() => {
      this.panels.delete(request.id);
      this.focusedRequestId = this.focusedRequestId === request.id ? undefined : this.focusedRequestId;
      this.streams.get(request.id)?.dispose();
      this.streams.delete(request.id);
    });
    return panel;
  }

  private handleStreamMessage(requestId: string, panel: vscode.WebviewPanel, message: WebviewToHostMessage): boolean {
    if (message.type === 'streamConnect') {
      this.streamFor(requestId, panel).connect(message.request);
    } else if (message.type === 'streamDisconnect') {
      this.streamFor(requestId, panel).disconnect();
    } else if (message.type === 'wsSend') {
      this.streamFor(requestId, panel).send(message.text);
    } else if (message.type === 'grpcEnd') {
      this.streamFor(requestId, panel).end();
    } else if (message.type === 'grpcLoadProto') {
      void this.loadGrpcServices(requestId, panel, message.request);
    } else if (message.type === 'grpcPickPath') {
      const pick = message.pathKind === 'protoFile' ? pickProtoFile : pickImportFolder;
      void pick().then((path) => path && post(panel, { type: 'grpcPathPicked', pathKind: message.pathKind, path }));
    } else {
      return false;
    }
    return true;
  }

  private handleGraphqlMessage(requestId: string, panel: vscode.WebviewPanel, message: WebviewToHostMessage): boolean {
    if (message.type === 'graphqlFetchSchema') {
      void this.fetchGraphqlSchema(requestId, panel, message.request);
    } else if (message.type === 'graphqlLoadCachedSchema') {
      void this.postCachedGraphqlSchema(requestId, panel, message.request);
    } else {
      return false;
    }
    return true;
  }

  private async postCachedGraphqlSchema(requestId: string, panel: vscode.WebviewPanel, request: RequestModel): Promise<void> {
    await this.loadSecrets(requestId);
    const url = prepareRequest(createIntrospectionRequest(request), this.variablesFor(requestId)).url;
    const cached = await this.graphqlSchemas?.load(url);
    if (cached) {
      post(panel, { type: 'graphqlSchema', schema: cached.schema, fetchedAt: cached.fetchedAt, cached: true });
    }
  }

  private async fetchGraphqlSchema(requestId: string, panel: vscode.WebviewPanel, request: RequestModel): Promise<void> {
    post(panel, { type: 'graphqlSchemaFetching' });
    await this.loadSecrets(requestId);
    const { prepared, response } = await this.scriptedSender.send(requestId, createIntrospectionRequest(request), (effective, variables, timeoutMs) =>
      this.prepareWithOAuth(effective, variables, timeoutMs, panel),
    );
    const parsed = response.error ? undefined : parseIntrospectionResponse(response.body);
    if (parsed?.ok) {
      const cached = await this.persistGraphqlSchema(prepared.url, parsed.schema);
      post(panel, { type: 'graphqlSchema', schema: cached.schema, fetchedAt: cached.fetchedAt, cached: false });
      return;
    }
    const reason = response.error ?? (parsed?.ok === false ? parsed.message : 'Unknown error');
    post(panel, { type: 'graphqlSchemaError', message: response.error ? reason : `${response.status} ${response.statusText}: ${reason}` });
  }

  private async persistGraphqlSchema(url: string, schema: GraphqlSchemaSummary): Promise<CachedSchema> {
    return (await this.graphqlSchemas?.save(url, schema).catch(() => undefined)) ?? { schema, fetchedAt: Date.now() };
  }

  private async loadGrpcServices(requestId: string, panel: vscode.WebviewPanel, request: RequestModel): Promise<void> {
    try {
      await this.loadSecrets(requestId);
      const prepared = prepareGrpcCall(request, this.variablesFor(requestId));
      const { network } = buildSendOptions(`https://${prepared.target}`, request.timeoutMs);
      const services = await describeGrpcServices(prepared, { rejectUnauthorized: network.rejectUnauthorized });
      post(panel, { type: 'grpcServices', services });
    } catch (error) {
      post(panel, { type: 'grpcServices', services: [], error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async cookieSessionFor(requestId: string): Promise<CookieSession | undefined> {
    const collectionId = this.storage.findCollectionOfEntry(requestId)?.id;
    return collectionId ? this.cookies.sessionFor(collectionId) : undefined;
  }

  private streamFor(requestId: string, panel: vscode.WebviewPanel): StreamSession {
    const existing = this.streams.get(requestId);
    if (existing) {
      return existing;
    }
    const created = new StreamSession(
      (message) => post(panel, message),
      () => this.variablesFor(requestId),
      () => this.cookieSessionFor(requestId),
      (recording, request) => void this.recordStreamHistory(requestId, request, recording),
    );
    this.streams.set(requestId, created);
    return created;
  }

  private handleMessage(requestId: string, panel: vscode.WebviewPanel, message: WebviewToHostMessage): void {
    if (this.handleStreamMessage(requestId, panel, message) || this.handleGraphqlMessage(requestId, panel, message)) {
      return;
    }
    if (message.type === 'ready') {
      this.postLoad(requestId, panel);
      postAutoSaveSettings(panel);
      this.postEnvironmentState(requestId, panel);
      void this.postHistoryList(requestId, panel);
    } else if (message.type === 'save') {
      this.storage.updateRequest(message.request);
      post(panel, { type: 'saved' });
    } else if (message.type === 'copyCurl') {
      void this.copyCurl(requestId, message.request);
    } else if (message.type === 'diagnoseNetwork') {
      void this.diagnoseNetwork(requestId, message.request);
    } else if (message.type === 'setActiveEnvironment') {
      this.setActiveEnvironment(requestId, message.environmentId);
    } else if (message.type === 'pickFile') {
      void pickFile().then((path) => path && post(panel, { type: 'filePicked', target: message.target, path }));
    } else if (message.type === 'manageEnvironments') {
      this.manageEnvironments(requestId);
    } else if (message.type === 'saveResponseBody') {
      void saveResponseBody(message.body, message.extension);
    } else if (message.type === 'send') {
      void this.execute(requestId, panel, message.request);
    } else if (message.type === 'fetchOAuthToken') {
      void this.fetchOAuthToken(requestId, panel, message.request);
    } else if (message.type === 'historySelect') {
      void this.postHistoryEntry(requestId, panel, message.entryId);
    } else if (message.type === 'historyDelete') {
      void this.history.remove(requestId, message.entryId).then(() => this.postHistoryList(requestId, panel));
    } else if (message.type === 'historyClear') {
      void this.history.clear(requestId).then(() => this.postHistoryList(requestId, panel));
    }
  }

  async clearAllHistory(): Promise<void> {
    await this.history.clearAll();
    for (const [requestId, panel] of this.panels) {
      await this.postHistoryList(requestId, panel);
    }
  }

  private async postHistoryList(requestId: string, panel: vscode.WebviewPanel): Promise<void> {
    const entries = await this.history.list(requestId);
    post(panel, { type: 'historyList', entries: entries.map(toSummary) });
  }

  private async postHistoryEntry(requestId: string, panel: vscode.WebviewPanel, entryId: string): Promise<void> {
    const entry = (await this.history.list(requestId)).find((candidate) => candidate.id === entryId);
    if (entry) {
      post(panel, { type: 'historyEntry', entry });
    }
  }

  private async recordHistory(requestId: string, request: RequestModel, prepared: PreparedRequest, response: ResponseModel): Promise<void> {
    const settings = vscode.workspace.getConfiguration('routiq');
    const entry = createHistoryEntry(
      {
        id: generateId(),
        timestamp: Date.now(),
        request,
        finalUrl: prepared.url,
        requestHeaders: prepared.headers,
        requestBody: prepared.body,
        response,
      },
      settings.get<number>('history.maxBodyBytes', 262144),
    );
    await this.history.record(requestId, entry, settings.get<number>('history.maxEntries', 50));
  }

  private async recordStreamHistory(requestId: string, request: RequestModel, recording: StreamRecording): Promise<void> {
    const settings = vscode.workspace.getConfiguration('routiq');
    const entry = createStreamHistoryEntry({ id: generateId(), request, url: substituteVariables(request.url, this.variablesFor(requestId)), recording });
    await this.history.record(requestId, entry, settings.get<number>('history.maxEntries', 50)).catch(() => undefined);
    const panel = this.panels.get(requestId);
    if (panel) {
      await this.postHistoryList(requestId, panel);
    }
  }

  private async execute(requestId: string, panel: vscode.WebviewPanel, request: RequestModel): Promise<void> {
    post(panel, { type: 'sending' });
    await this.loadSecrets(requestId);
    const { prepared, response } = await this.scriptedSender.send(requestId, request, (effective, variables, timeoutMs) =>
      this.prepareWithOAuth(effective, variables, timeoutMs, panel),
    );
    post(panel, { type: 'response', response });
    await this.recordHistory(requestId, request, prepared, response).catch(() => undefined);
    await this.postHistoryList(requestId, panel);
  }

  private async prepareWithOAuth(
    request: RequestModel,
    variables: Record<string, string>,
    timeoutMs: number,
    panel: vscode.WebviewPanel,
  ): Promise<PreparedRequest> {
    if (request.auth.type !== 'oauth2') {
      return prepareRequest(request, variables);
    }
    try {
      const oauthAuthorization = await obtainAuthorization(request.auth, variables, timeoutMs);
      return prepareRequest(request, variables, { oauthAuthorization });
    } catch (error) {
      post(panel, { type: 'oauthTokenResult', ok: false, message: describeFailure(error) });
      return prepareRequest(request, variables);
    }
  }

  private async fetchOAuthToken(requestId: string, panel: vscode.WebviewPanel, request: RequestModel): Promise<void> {
    if (request.auth.type !== 'oauth2') {
      return;
    }
    await this.loadSecrets(requestId);
    const variables = this.variablesFor(requestId);
    const timeoutMs = defaultTimeoutMs();
    try {
      const token = await obtainToken(request.auth, variables, timeoutMs, true);
      post(panel, { type: 'oauthTokenResult', ok: true, message: describeToken(token) });
    } catch (error) {
      post(panel, { type: 'oauthTokenResult', ok: false, message: describeFailure(error) });
    }
  }

  private variablesFor(requestId: string): Record<string, string> {
    const location = this.storage.findRequest(requestId);
    return location ? resolveCollectionVariables(this.vault.hydrate(location.collection)) : {};
  }

  private async loadSecrets(requestId: string): Promise<void> {
    const location = this.storage.findRequest(requestId);
    if (location) {
      await this.vault.load([location.collection]);
    }
  }

  private async copyCurl(requestId: string, request: RequestModel): Promise<void> {
    await this.loadSecrets(requestId);
    await copyRequestAsCurl(request, this.variablesFor(requestId));
  }

  async diagnoseNetwork(requestId: string, request: RequestModel): Promise<void> {
    await this.loadSecrets(requestId);
    const prepared = prepareRequest(request, this.variablesFor(requestId));
    await this.networkDiagnosis.show({ template: request.url, prepared, timeoutMs: request.timeoutMs });
  }

  async diagnoseActiveRequest(): Promise<void> {
    const location = this.focusedRequestId ? this.storage.findRequest(this.focusedRequestId) : undefined;
    if (!location) {
      void vscode.window.showInformationMessage('Open a request first, then run Diagnose Network.');
      return;
    }
    await this.diagnoseNetwork(location.request.id, location.request);
  }

  private setActiveEnvironment(requestId: string, environmentId?: string): void {
    const location = this.storage.findRequest(requestId);
    if (location) {
      this.storage.setActiveEnvironment(location.collection.id, environmentId);
    }
  }

  private manageEnvironments(requestId: string): void {
    const location = this.storage.findRequest(requestId);
    if (location) {
      void vscode.commands.executeCommand('routiq.manageEnvironments', location.collection.id);
    }
  }

  private postEnvironmentState(requestId: string, panel: vscode.WebviewPanel): void {
    const location = this.storage.findRequest(requestId);
    if (location) {
      post(panel, {
        type: 'environmentState',
        environments: summarizeEnvironments(location.collection),
        activeEnvironmentId: location.collection.activeEnvironmentId,
      });
      post(panel, { type: 'variableSuggestions', variables: collectVariableSuggestions(location.collection) });
    }
  }

  get activeRequestId(): string | undefined {
    return this.focusedRequestId;
  }

  private announceFocus(requestId: string): void {
    this.focusedRequestId = requestId;
    this.requestFocusEmitter.fire(requestId);
    const location = this.storage.findRequest(requestId);
    if (location) {
      this.focusEmitter.fire(location.collection.id);
    }
  }

  private postLoad(requestId: string, panel: vscode.WebviewPanel): void {
    const location = this.storage.findRequest(requestId);
    if (location) {
      post(panel, { type: 'load', request: location.request, collectionName: location.collection.name });
    }
  }

  private syncPanelsWithStorage(): void {
    for (const [requestId, panel] of this.panels) {
      const location = this.storage.findRequest(requestId);
      if (!location) {
        panel.dispose();
      } else {
        panel.title = location.request.name;
        this.postEnvironmentState(requestId, panel);
      }
    }
  }
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function postAutoSaveSettings(panel: vscode.WebviewPanel): void {
  post(panel, { type: 'autoSaveSettings', ...readAutoSaveSettings() });
}

function post(panel: vscode.WebviewPanel, message: HostToWebviewMessage): void {
  void panel.webview.postMessage(message);
}

import * as vscode from 'vscode';
import { resolveCollectionVariables } from '../core/environments';
import { KafkaConnectionConfig, buildConnectionConfig, substituteProfileVariables, validateProfileForConnect, validateProfileForProduce } from '../core/kafka/connection';
import { MessageBatcher, intervalScheduler } from '../core/kafka/messageBatcher';
import { prependMessages, removeMessages } from '../core/kafka/messageList';
import { DEFAULT_MAX_MESSAGE_BYTES_DISPLAYED, limitMessageSizes } from '../core/kafka/truncation';
import { substituteVariables } from '../core/variables';
import { KafkaHostMessage, KafkaMessage, KafkaProduceRequest, KafkaProfileDraft, KafkaStatus, KafkaWebviewMessage } from '../shared/types';
import { pickProtoFile } from './filePicker';
import { KafkaAdminService, createKafkaAdmin } from './kafkaAdmin';
import { KafkaAdminController } from './kafkaAdminController';
import { KafkaClientFactory, createKafkaClient } from './kafkaClient';
import { KafkaValueDecoder } from './kafkaDecoding';
import { KafkaMessageFeatures } from './kafkaMessageFeatures';
import { KafkaMessageHistory } from './kafkaMessageHistory';
import { KafkaMessageSettingsStore } from './kafkaMessageSettings';
import { KafkaProfileStore } from './kafkaProfileStore';
import { KafkaProduceController } from './kafkaProduceController';
import { createProduceEnvironment } from './kafkaProduceEnvironment';
import { KafkaProducerJobs } from './kafkaProducerJobs';
import { KafkaSession } from './kafkaSession';
import { KafkaTemplateStore } from './kafkaTemplateStore';
import { SecretVault } from './secretVault';
import { Storage } from './storage';
import { renderWebviewHtml } from './webviewHtml';

const FLUSH_DELAY_MS = 50;
const PERSIST_DELAY_MS = 1000;
const NEW_CONNECTION_NAME = 'New Connection';

interface KafkaSettings {
  maxMessages: number;
  persistedMessages: number;
  connectionTimeoutMs: number;
  adminTimeoutMs: number;
  groupsRefreshSeconds: number;
  maxMessageBytesDisplayed: number;
}

function readSettings(): KafkaSettings {
  const config = vscode.workspace.getConfiguration('routiq');
  return {
    maxMessages: Math.max(1, config.get<number>('kafka.maxMessages', 1000)),
    persistedMessages: Math.max(0, config.get<number>('kafka.persistedMessages', 200)),
    connectionTimeoutMs: Math.max(1000, config.get<number>('kafka.connectionTimeoutMs', 10000)),
    adminTimeoutMs: Math.max(1000, config.get<number>('kafka.adminTimeoutMs', 15000)),
    groupsRefreshSeconds: Math.max(2, config.get<number>('kafka.groupsRefreshSeconds', 10)),
    maxMessageBytesDisplayed: Math.max(0, config.get<number>('kafka.maxMessageBytesDisplayed', DEFAULT_MAX_MESSAGE_BYTES_DISPLAYED)),
  };
}

function post(panel: vscode.WebviewPanel, message: KafkaHostMessage): void {
  void panel.webview.postMessage(message);
}

export interface KafkaPanelDependencies {
  extensionUri: vscode.Uri;
  storage: Storage;
  vault: SecretVault;
  profiles: KafkaProfileStore;
  history: KafkaMessageHistory;
  templates: KafkaTemplateStore;
  messageSettings: KafkaMessageSettingsStore;
  clientFactory: KafkaClientFactory;
}

class KafkaPanel implements vscode.Disposable {
  private readonly session: KafkaSession;
  private readonly produceController: KafkaProduceController;
  private readonly admin: KafkaAdminController;
  private readonly decoder = new KafkaValueDecoder();
  private readonly messageFeatures: KafkaMessageFeatures;
  private readonly settings = readSettings();
  private messages: KafkaMessage[] = [];
  private readonly batcher = new MessageBatcher<KafkaMessage>((batch) => this.applyBatch(batch), intervalScheduler(FLUSH_DELAY_MS), this.settings.maxMessages);
  private status: KafkaStatus = { state: 'disconnected' };
  private persistTimer: NodeJS.Timeout | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    readonly panel: vscode.WebviewPanel,
    private readonly dependencies: KafkaPanelDependencies,
    private activeProfileId: string | undefined,
    private readonly onDisposed: (panel: KafkaPanel) => void,
  ) {
    this.session = new KafkaSession(
      dependencies.clientFactory,
      { onMessage: (message) => this.enqueue(message), onStatus: (status) => this.updateStatus(status) },
      { connectionTimeoutMs: this.settings.connectionTimeoutMs, decodeMessage: (message) => this.decoder.decodeMessage(message) },
    );
    this.messageFeatures = new KafkaMessageFeatures({
      post: (message) => post(panel, message),
      settings: dependencies.messageSettings,
      decoder: this.decoder,
      storage: dependencies.storage,
    });
    this.admin = new KafkaAdminController({
      service: new KafkaAdminService(createKafkaAdmin, { timeoutMs: this.settings.adminTimeoutMs }),
      resolveConfig: async (profile) => (await this.resolveConfig(profile)).config,
      post: (message) => void panel.webview.postMessage(message),
      refreshIntervalSeconds: this.settings.groupsRefreshSeconds,
    });
    this.produceController = new KafkaProduceController(
      createProduceEnvironment({
        profiles: dependencies.profiles,
        templates: dependencies.templates,
        post: (message) => post(panel, message),
        resolveConnection: async (profile) => {
          const { config, variables, error } = await this.resolveConfig(profile);
          return { config, variables, error };
        },
      }),
      new KafkaProducerJobs(dependencies.clientFactory, { connectionTimeoutMs: this.settings.connectionTimeoutMs }),
    );
    this.messages = activeProfileId ? dependencies.history.messages(activeProfileId) : [];
    panel.webview.html = renderWebviewHtml(panel.webview, dependencies.extensionUri, 'kafka');
    this.subscriptions.push(
      panel.webview.onDidReceiveMessage((message: KafkaWebviewMessage) => void this.handleMessage(message)),
      panel.onDidDispose(() => this.handleDisposed()),
      dependencies.profiles.onDidChange(() => void this.postProfiles()),
    );
  }

  get profileId(): string | undefined {
    return this.activeProfileId;
  }

  reveal(): void {
    this.panel.reveal();
  }

  dispose(): void {
    this.panel.dispose();
  }

  private handleDisposed(): void {
    this.batcher.discard();
    clearTimeout(this.persistTimer);
    void this.persistNow();
    this.produceController.stopAll();
    void this.session.disconnect(false);
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.onDisposed(this);
  }

  private async handleMessage(message: KafkaWebviewMessage): Promise<void> {
    switch (message.type) {
      case 'kafkaReady':
        this.produceController.postTemplates();
        this.admin.postSettings();
        return this.postInit();
      case 'adminRequest':
        return this.admin.handle(message);
      case 'kafkaSaveProfile':
        return this.saveProfile(message.profile);
      case 'kafkaDeleteProfile':
        return this.deleteProfile(message.profileId);
      case 'kafkaSelectProfile':
        return this.selectProfile(message.profileId);
      case 'kafkaConnect':
        return this.connect(message.profile);
      case 'kafkaDisconnect':
        this.produceController.stopAll();
        return this.session.disconnect();
      case 'kafkaProduce':
        return this.produce(message.request);
      case 'kafkaDeleteMessages':
        return this.replaceMessages(removeMessages(this.messages, message.messageIds));
      case 'kafkaClearMessages':
        return this.replaceMessages([]);
      case 'kafkaImportLogFile':
        return this.importLogFile();
      case 'kafkaClearLogFile':
        return this.clearLogFile();
      case 'kafkaPickProtoFile':
        return this.pickProtoFile();
      case 'kafkaSaveFile':
        return this.saveFile(message.suggestedName, message.content);
      case 'kafkaCopy':
        return this.copy(message.text);
      case 'kafkaSend':
        return this.produceController.send(message.request);
      case 'kafkaReplay':
        return this.produceController.replay(message.request);
      case 'kafkaStopJob':
        return this.produceController.stop(message.jobId);
      case 'kafkaExportMessages':
        return this.produceController.exportMessages(message.format, message.suggestedName, message.messages);
      case 'kafkaSaveTemplate':
        return this.produceController.saveTemplate(message.template);
      case 'kafkaDeleteTemplate':
        return this.produceController.deleteTemplate(message.templateId);
      case 'kafkaRequestFullMessage':
        return this.postFullMessage(message.messageId);
      case 'kafkaSaveUiState':
      case 'kafkaDecode':
      case 'kafkaRuleHit':
      case 'kafkaSaveAsRequest':
        return this.messageFeatures.handle(message);
    }
  }

  private async postInit(): Promise<void> {
    await this.configureSchemaRegistry(this.activeProfileId ? this.dependencies.profiles.get(this.activeProfileId) : undefined);
    post(this.panel, {
      type: 'kafkaInit',
      profiles: await this.dependencies.profiles.views(),
      activeProfileId: this.activeProfileId,
      collections: this.dependencies.storage.getCollections().map(({ id, name }) => ({ id, name })),
      maxMessages: this.settings.maxMessages,
      status: this.status,
      messages: this.displayed(this.messages),
      logFile: await this.readLogFile(),
      ui: this.dependencies.messageSettings.readUi(),
    });
  }

  private async postProfiles(): Promise<void> {
    post(this.panel, { type: 'kafkaProfiles', profiles: await this.dependencies.profiles.views(), activeProfileId: this.activeProfileId });
  }

  private async saveProfile(draft: KafkaProfileDraft): Promise<void> {
    this.activeProfileId = draft.id;
    await this.dependencies.profiles.save(draft);
    await this.dependencies.messageSettings.saveRegistryPassword(draft);
    await this.configureSchemaRegistry(draft);
    await this.dependencies.profiles.rememberLast(draft.id);
    this.panel.title = `Kafka — ${draft.name}`;
  }

  private async deleteProfile(profileId: string): Promise<void> {
    this.activeProfileId = this.activeProfileId === profileId ? undefined : this.activeProfileId;
    await this.dependencies.profiles.remove(profileId);
    await this.dependencies.messageSettings.removeRegistryPassword(profileId);
    await this.dependencies.history.saveMessages(profileId, [], 0);
  }

  private async selectProfile(profileId: string): Promise<void> {
    if (this.session.isActive) {
      return;
    }
    this.activeProfileId = profileId;
    this.panel.title = `Kafka — ${this.dependencies.profiles.get(profileId)?.name ?? 'Listener'}`;
    this.replaceMessages(this.dependencies.history.messages(profileId));
    await this.configureSchemaRegistry(this.dependencies.profiles.get(profileId));
    await this.postProfiles();
  }

  private async configureSchemaRegistry(profile: KafkaProfileDraft | undefined): Promise<void> {
    this.decoder.configure(await this.dependencies.messageSettings.resolveRegistry(profile));
    this.decoder.configureProtobuf(profile && { file: profile.protobufFile, messageType: profile.protobufMessageType, topicTypes: profile.protobufTopicTypes });
  }

  private async variablesFor(collectionId: string | undefined): Promise<Record<string, string>> {
    const collection = collectionId ? this.dependencies.storage.getCollection(collectionId) : undefined;
    if (!collection) {
      return {};
    }
    await this.dependencies.vault.load([collection]);
    return resolveCollectionVariables(this.dependencies.vault.hydrate(collection));
  }

  private async resolveConfig(draft: KafkaProfileDraft): Promise<{ config: KafkaConnectionConfig; error?: string; variables: Record<string, string> }> {
    const variables = await this.variablesFor(draft.variablesCollectionId);
    const profile = substituteProfileVariables(draft, variables);
    const password = draft.saslPassword ?? (await this.dependencies.profiles.readPassword(draft.id));
    const secrets = { ...(await this.dependencies.profiles.readSecrets(draft.id)), ...draft.secrets };
    return { config: buildConnectionConfig(profile, { password, secrets, environment: process.env }), error: validateProfileForConnect(profile), variables };
  }

  private async connect(draft: KafkaProfileDraft): Promise<void> {
    const { config, error } = await this.resolveConfig(draft);
    if (error) {
      this.updateStatus({ state: 'error', detail: error });
      return;
    }
    this.activeProfileId = draft.id;
    this.panel.title = `Kafka — ${draft.name || 'Listener'}`;
    await this.dependencies.profiles.rememberLast(draft.id);
    await this.configureSchemaRegistry(draft);
    await this.session.connect(config);
  }

  private async produce(request: KafkaProduceRequest): Promise<void> {
    const { config, variables } = await this.resolveConfig(request.profile);
    const topic = substituteVariables(request.topic, variables).trim();
    const invalid =
      this.produceController.readOnlyViolation(request.profile) ??
      validateProfileForProduce(substituteProfileVariables(request.profile, variables), topic, request.value);
    const result = invalid
      ? { requestId: request.requestId, ok: false, topic, error: invalid }
      : await this.session.produce(config, { topic, key: request.key, value: request.value, headers: request.headers }, request.requestId);
    post(this.panel, { type: 'kafkaProduceResult', result });
  }

  private updateStatus(status: KafkaStatus): void {
    this.status = status;
    post(this.panel, { type: 'kafkaStatus', status });
    status.state === 'error' && void vscode.window.showErrorMessage(`Routiq Kafka: ${status.detail ?? 'connection failed'}`);
  }

  private enqueue(message: KafkaMessage): void {
    this.batcher.push(message);
  }

  private applyBatch(batch: KafkaMessage[]): void {
    this.messages = prependMessages(this.messages, batch, this.settings.maxMessages);
    post(this.panel, { type: 'kafkaMessages', messages: this.displayed(batch), replace: false });
    this.schedulePersist();
  }

  private displayed(messages: KafkaMessage[]): KafkaMessage[] {
    return limitMessageSizes(messages, this.settings.maxMessageBytesDisplayed);
  }

  private postFullMessage(messageId: string): void {
    const message = this.messages.find((candidate) => candidate.id === messageId);
    message && post(this.panel, { type: 'kafkaFullMessage', message });
  }

  private replaceMessages(messages: KafkaMessage[]): void {
    this.messages = messages;
    post(this.panel, { type: 'kafkaMessages', messages: this.displayed(messages), replace: true });
    this.schedulePersist();
  }

  private schedulePersist(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persistNow(), PERSIST_DELAY_MS);
  }

  private async persistNow(): Promise<void> {
    this.activeProfileId && (await this.dependencies.history.saveMessages(this.activeProfileId, this.displayed(this.messages), this.settings.persistedMessages));
  }

  private async readLogFile() {
    const path = this.dependencies.history.logFilePath;
    return path ? readLogFileAt(vscode.Uri.file(path)) : undefined;
  }

  private async importLogFile(): Promise<void> {
    const [file] =
      (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Logs and exports': ['json', 'ndjson', 'log', 'txt', 'csv'] }, openLabel: 'Open log or Routiq export' })) ?? [];
    if (!file) {
      return;
    }
    const logFile = await readLogFileAt(file);
    logFile && (await this.dependencies.history.rememberLogFile(file.fsPath));
    post(this.panel, { type: 'kafkaLogFile', logFile });
  }

  private async pickProtoFile(): Promise<void> {
    const path = await pickProtoFile();
    path && post(this.panel, { type: 'kafkaProtoFilePicked', path });
  }

  private async clearLogFile(): Promise<void> {
    await this.dependencies.history.rememberLogFile(undefined);
    post(this.panel, { type: 'kafkaLogFile' });
  }

  private async saveFile(suggestedName: string, content: string): Promise<void> {
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(suggestedName), filters: { JSON: ['json'] } });
    if (target) {
      await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
      void vscode.window.showInformationMessage(`Routiq: saved ${target.fsPath}`);
    }
  }

  private async copy(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
    void vscode.window.setStatusBarMessage('Copied to clipboard', 3000);
  }
}

async function readLogFileAt(uri: vscode.Uri) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return { name: uri.path.split('/').pop() ?? uri.fsPath, text: Buffer.from(bytes).toString('utf8') };
  } catch {
    return undefined;
  }
}

export class KafkaPanels implements vscode.Disposable {
  private readonly panels = new Set<KafkaPanel>();

  constructor(private readonly dependencies: Omit<KafkaPanelDependencies, 'clientFactory'> & { clientFactory?: KafkaClientFactory }) {}

  openProfile(profileId?: string): void {
    const existing = profileId ? [...this.panels].find((panel) => panel.profileId === profileId) : undefined;
    if (existing) {
      existing.reveal();
      return;
    }
    this.createPanel(profileId ?? this.dependencies.profiles.lastProfileId);
  }

  async openNewConnection(name: string): Promise<void> {
    const profile = await this.dependencies.profiles.create(name || NEW_CONNECTION_NAME);
    this.openProfile(profile.id);
  }

  get openCount(): number {
    return this.panels.size;
  }

  dispose(): void {
    [...this.panels].forEach((panel) => panel.dispose());
  }

  private createPanel(profileId: string | undefined): void {
    const title = `Kafka${profileId ? ` — ${this.dependencies.profiles.get(profileId)?.name ?? 'Listener'}` : ''}`;
    const webviewPanel = vscode.window.createWebviewPanel('routiq.kafka', title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.dependencies.extensionUri, 'dist')],
    });
    const dependencies = { ...this.dependencies, clientFactory: this.dependencies.clientFactory ?? createKafkaClient };
    this.panels.add(new KafkaPanel(webviewPanel, dependencies, profileId, (closed) => this.panels.delete(closed)));
  }
}

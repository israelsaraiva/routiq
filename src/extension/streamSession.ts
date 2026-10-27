import * as vscode from 'vscode';
import { effectiveTimeoutMs } from '../core/network';
import { requestKindOf } from '../core/requestKinds';
import { prepareGrpcCall } from '../core/grpcPreparation';
import { prepareStream } from '../core/streamPreparation';
import { byteLength } from '../core/streamLog';
import { StreamRecorder, StreamRecording } from '../core/streamRecording';
import { RequestKind, RequestModel, StreamHostMessage, StreamStatus } from '../shared/types';
import { defaultTimeoutMs, buildSendOptions } from './networkSettings';
import { GrpcConnection, connectGrpc } from './grpcClient';
import { CookieSession } from './httpClient';
import { StreamConnection, StreamHandlers, connectSse, connectWebSocket } from './streamConnections';

const DEFAULT_RECONNECT_DELAY_MS = 3000;

export type StreamRecordingListener = (recording: StreamRecording, request: RequestModel) => void;

function recordedKindOf(request: RequestModel): RequestKind {
  const kind = requestKindOf(request);
  return kind === 'http' ? 'sse' : kind;
}

export class StreamSession implements vscode.Disposable {
  private connection?: StreamConnection;
  private reconnectTimer?: NodeJS.Timeout;
  private generation = 0;
  private sequence = 0;
  private retryDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  private readonly recorder = new StreamRecorder();
  private recordedRequest?: RequestModel;

  constructor(
    private readonly post: (message: StreamHostMessage) => void,
    private readonly variables: () => Record<string, string>,
    private readonly cookieSession: () => Promise<CookieSession | undefined> = async () => undefined,
    private readonly onRecorded: StreamRecordingListener = () => undefined,
  ) {}

  connect(request: RequestModel): void {
    this.disconnect(false);
    const generation = ++this.generation;
    this.recordedRequest = request;
    this.recorder.begin(recordedKindOf(request));
    this.emit({ type: 'streamStatus', status: 'connecting' });
    this.openConnection(request, generation).catch((error: unknown) => this.reportFailure(generation, error));
  }

  end(): void {
    (this.connection as GrpcConnection | undefined)?.end?.();
  }

  disconnect(announce = true): void {
    this.generation++;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.connection?.close();
    this.connection = undefined;
    if (announce) {
      this.report('closed', 'Disconnected');
    } else {
      this.capture(this.recorder.abort('Disconnected'));
    }
  }

  send(text: string): void {
    try {
      if (!this.connection?.send(text)) {
        this.report('error', 'Not connected');
        return;
      }
    } catch (error) {
      this.report('open', error instanceof Error ? error.message : String(error));
      return;
    }
    this.postSent(text);
  }

  dispose(): void {
    this.disconnect(false);
  }

  private emit(message: StreamHostMessage): void {
    this.post(message);
    this.capture(this.recorder.observe(message));
  }

  private capture(recording: StreamRecording | undefined): void {
    if (recording && this.recordedRequest) {
      this.onRecorded(recording, this.recordedRequest);
    }
  }

  private postSent(text: string): void {
    this.emit({
      type: 'wsMessage',
      entry: { sequence: ++this.sequence, timestamp: Date.now(), direction: 'sent', text, sizeBytes: byteLength(text), binary: false },
    });
  }

  private reportFailure(generation: number, error: unknown): void {
    if (generation === this.generation) {
      this.report('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async openConnection(request: RequestModel, generation: number): Promise<void> {
    const connection = requestKindOf(request) === 'grpc' ? await this.openGrpc(request, generation) : await this.open(request, generation);
    if (generation === this.generation) {
      this.connection = connection;
    } else {
      connection.close();
    }
  }

  private openGrpc(request: RequestModel, generation: number): Promise<StreamConnection> {
    const prepared = prepareGrpcCall(request, this.variables());
    const { network } = buildSendOptions(`https://${prepared.target}`, request.timeoutMs);
    return connectGrpc(prepared, { rejectUnauthorized: network.rejectUnauthorized }, this.handlersFor(request, generation));
  }

  private async open(request: RequestModel, generation: number): Promise<StreamConnection> {
    const prepared = prepareStream(request, this.variables());
    const { network } = buildSendOptions(prepared.url, request.timeoutMs);
    const target = { prepared, network, timeoutMs: effectiveTimeoutMs(request.timeoutMs, defaultTimeoutMs()), cookies: await this.cookieSession() };
    const handlers = this.handlersFor(request, generation);
    return requestKindOf(request) === 'websocket' ? connectWebSocket(target, handlers) : connectSse(target, handlers);
  }

  private handlersFor(request: RequestModel, generation: number): StreamHandlers {
    const whenCurrent =
      <Args extends unknown[]>(handler: (...args: Args) => void) =>
      (...args: Args) =>
        generation === this.generation && handler(...args);
    return {
      onOpen: whenCurrent((detail?: string) => this.report('open', detail)),
      onSseEvent: whenCurrent((event) => {
        this.retryDelayMs = event.retry ?? this.retryDelayMs;
        this.emit({ type: 'sseEvent', entry: { sequence: ++this.sequence, timestamp: Date.now(), event } });
      }),
      onWebSocketMessage: whenCurrent((text, binary, sizeBytes, payloadBase64) =>
        this.emit({
          type: 'wsMessage',
          entry: { sequence: ++this.sequence, timestamp: Date.now(), direction: 'received', text, sizeBytes, binary, ...(payloadBase64 ? { payloadBase64 } : {}) },
        }),
      ),
      onGrpcSent: whenCurrent((text) => this.postSent(text)),
      onGrpcStatus: whenCurrent((status) => this.emit({ type: 'grpcStatus', status })),
      onClosed: whenCurrent((detail, failed) => {
        this.connection = undefined;
        this.report(failed ? 'error' : 'closed', detail);
        this.scheduleReconnect(request);
      }),
    };
  }

  private scheduleReconnect(request: RequestModel): void {
    if (!request.autoReconnect) {
      return;
    }
    this.reconnectTimer = setTimeout(() => this.connect(request), this.retryDelayMs);
  }

  private report(status: StreamStatus, detail?: string): void {
    this.emit({ type: 'streamStatus', status, detail });
  }
}

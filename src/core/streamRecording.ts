import { GrpcCallStatus, RequestKind, StreamHistoryMessage, StreamHistorySession, StreamHostMessage } from '../shared/types';
import { truncateBody } from './history';

export const MAX_RECORDED_MESSAGES = 200;
export const MAX_RECORDED_MESSAGE_BYTES = 8192;

export interface StreamRecording {
  kind: RequestKind;
  startedAt: number;
  endedAt: number;
  messages: StreamHistoryMessage[];
  totalMessages: number;
  totalBytes: number;
  closeDetail?: string;
  failed: boolean;
  grpcStatus?: GrpcCallStatus;
}

type Clock = () => number;

function capMessageText(text: string): string {
  const { text: kept, truncated } = truncateBody(text, MAX_RECORDED_MESSAGE_BYTES);
  return truncated ? `${kept}…` : kept;
}

function toHistoryMessage(message: StreamHostMessage): (StreamHistoryMessage & { sizeBytes: number }) | undefined {
  if (message.type === 'sseEvent') {
    const { event, timestamp } = message.entry;
    return { timestamp, direction: 'received', label: event.event || 'message', text: event.data, sizeBytes: Buffer.byteLength(event.data) };
  }
  if (message.type === 'wsMessage') {
    const { text, timestamp, direction, binary, sizeBytes } = message.entry;
    return { timestamp, direction, ...(binary ? { label: 'binary' } : {}), text, sizeBytes };
  }
  return undefined;
}

export class StreamRecorder {
  private recording?: StreamRecording;

  constructor(private readonly clock: Clock = Date.now) {}

  get isActive(): boolean {
    return this.recording !== undefined;
  }

  begin(kind: RequestKind): void {
    this.recording = { kind, startedAt: this.clock(), endedAt: this.clock(), messages: [], totalMessages: 0, totalBytes: 0, failed: false };
  }

  observe(message: StreamHostMessage): StreamRecording | undefined {
    if (!this.recording) {
      return undefined;
    }
    if (message.type === 'grpcStatus') {
      this.recording.grpcStatus = message.status;
    } else if (message.type === 'streamStatus' && (message.status === 'closed' || message.status === 'error')) {
      return this.finish(message.detail, message.status === 'error');
    } else {
      this.append(message);
    }
    return undefined;
  }

  abort(detail: string): StreamRecording | undefined {
    return this.recording ? this.finish(detail, false) : undefined;
  }

  private append(message: StreamHostMessage): void {
    const converted = toHistoryMessage(message);
    if (!converted || !this.recording) {
      return;
    }
    const { sizeBytes, ...entry } = converted;
    this.recording.totalMessages += 1;
    this.recording.totalBytes += sizeBytes;
    if (this.recording.messages.length < MAX_RECORDED_MESSAGES) {
      this.recording.messages.push({ ...entry, text: capMessageText(entry.text) });
    }
  }

  private finish(detail: string | undefined, failed: boolean): StreamRecording | undefined {
    const finished = this.recording && { ...this.recording, endedAt: this.clock(), closeDetail: detail, failed };
    this.recording = undefined;
    return finished;
  }
}

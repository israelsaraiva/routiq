import { HistoryEntry, HistorySummary, RequestModel, ResponseModel, StreamHistorySession } from '../shared/types';
import { kindLabel } from './requestKinds';
import type { StreamRecording } from './streamRecording';

export interface HistorySource {
  request: RequestModel;
  finalUrl: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  response: ResponseModel;
  timestamp: number;
  id: string;
}

export interface TruncatedBody {
  text: string;
  truncated: boolean;
}

export function truncateBody(body: string, maxBytes: number): TruncatedBody {
  const encoded = Buffer.from(body, 'utf8');
  if (encoded.length <= maxBytes) {
    return { text: body, truncated: false };
  }
  const text = new TextDecoder('utf-8').decode(encoded.subarray(0, Math.max(0, maxBytes))).replace(/\uFFFD+$/, '');
  return { text, truncated: true };
}

export function createHistoryEntry(source: HistorySource, maxBodyBytes: number): HistoryEntry {
  const { response } = source;
  const body = truncateBody(response.body, maxBodyBytes);
  return {
    id: source.id,
    timestamp: source.timestamp,
    method: source.request.method,
    url: source.finalUrl,
    status: response.status,
    statusText: response.statusText,
    durationMs: response.timeMs,
    sizeBytes: response.sizeBytes,
    requestHeaders: Object.entries(source.requestHeaders),
    requestBody: source.requestBody,
    requestSnapshot: source.request,
    responseHeaders: response.headers,
    responseBody: body.text,
    bodyTruncated: body.truncated,
    error: response.error,
  };
}

export interface StreamHistorySource {
  request: RequestModel;
  url: string;
  recording: StreamRecording;
  id: string;
}

function describeSessionOutcome(recording: StreamRecording): string {
  if (recording.grpcStatus) {
    return recording.grpcStatus.codeName;
  }
  return recording.failed ? 'Error' : 'Closed';
}

function toHistorySession(recording: StreamRecording): StreamHistorySession {
  return {
    messages: recording.messages,
    totalMessages: recording.totalMessages,
    truncated: recording.totalMessages > recording.messages.length,
    ...(recording.closeDetail !== undefined ? { closeDetail: recording.closeDetail } : {}),
    ...(recording.grpcStatus ? { grpcStatus: recording.grpcStatus } : {}),
  };
}

export function createStreamHistoryEntry(source: StreamHistorySource): HistoryEntry {
  const { recording, request } = source;
  const session = toHistorySession(recording);
  return {
    id: source.id,
    kind: recording.kind,
    session,
    timestamp: recording.startedAt,
    method: kindLabel(recording.kind),
    url: source.url,
    status: recording.failed ? 0 : 200,
    statusText: describeSessionOutcome(recording),
    durationMs: recording.endedAt - recording.startedAt,
    sizeBytes: recording.totalBytes,
    requestHeaders: request.headers.filter((header) => header.enabled).map((header): [string, string] => [header.key, header.value]),
    requestSnapshot: request,
    responseHeaders: [],
    responseBody: '',
    bodyTruncated: false,
    error: recording.failed ? recording.closeDetail ?? describeSessionOutcome(recording) : undefined,
  };
}

export function addEntry(entries: HistoryEntry[], entry: HistoryEntry, maxEntries: number): HistoryEntry[] {
  return trimEntries([entry, ...entries], maxEntries);
}

export function trimEntries(entries: HistoryEntry[], maxEntries: number): HistoryEntry[] {
  const limit = Math.max(0, Math.floor(maxEntries));
  return [...entries].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function removeEntry(entries: HistoryEntry[], entryId: string): HistoryEntry[] {
  return entries.filter((entry) => entry.id !== entryId);
}

export function toSummary(entry: HistoryEntry): HistorySummary {
  return {
    id: entry.id,
    ...(entry.kind ? { kind: entry.kind } : {}),
    timestamp: entry.timestamp,
    method: entry.method,
    status: entry.status,
    statusText: entry.statusText,
    durationMs: entry.durationMs,
    error: entry.error,
  };
}

export function toResponseModel(entry: HistoryEntry): ResponseModel {
  return {
    status: entry.status,
    statusText: entry.statusText,
    timeMs: entry.durationMs,
    sizeBytes: entry.sizeBytes,
    headers: entry.responseHeaders,
    body: entry.responseBody,
    error: entry.error,
  };
}

export function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) {
    return 'just now';
  }
  const units: Array<[string, number]> = [['d', 86400], ['h', 3600], ['m', 60]];
  const [suffix, size] = units.find(([, unitSize]) => seconds >= unitSize) ?? ['m', 60];
  return `${Math.floor(seconds / size)}${suffix} ago`;
}

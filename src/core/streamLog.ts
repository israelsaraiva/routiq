import { SseLogEntry, WebSocketLogEntry } from '../shared/types';

export const MAX_LOG_ENTRIES = 5000;

const BYTES_PER_KIBIBYTE = 1024;

export function appendCapped<T>(entries: T[], entry: T, limit: number = MAX_LOG_ENTRIES): T[] {
  const next = [...entries, entry];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function matchesQuery(fields: Array<string | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || fields.some((field) => field !== undefined && field.toLowerCase().includes(needle));
}

export function filterSseLog(entries: SseLogEntry[], query: string): SseLogEntry[] {
  return entries.filter(({ event }) => matchesQuery([event.event, event.data, event.id], query));
}

export function filterWebSocketLog(entries: WebSocketLogEntry[], query: string): WebSocketLogEntry[] {
  return entries.filter((entry) => matchesQuery([entry.text, entry.direction], query));
}

export type BinaryView = 'hex' | 'base64';

const HEX_BYTES_PER_LINE = 16;

function bytesFromBase64(payloadBase64: string): number[] {
  return [...atob(payloadBase64)].map((character) => character.charCodeAt(0));
}

function toHexLines(bytes: number[]): string {
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0'));
  const lines: string[] = [];
  for (let start = 0; start < hex.length; start += HEX_BYTES_PER_LINE) {
    lines.push(hex.slice(start, start + HEX_BYTES_PER_LINE).join(' '));
  }
  return lines.join('\n');
}

export function formatBinaryPayload(payloadBase64: string, view: BinaryView): string {
  return view === 'base64' ? payloadBase64 : toHexLines(bytesFromBase64(payloadBase64));
}

export function displayedPayload(entry: WebSocketLogEntry, view: BinaryView): string {
  return entry.binary && entry.payloadBase64 !== undefined ? formatBinaryPayload(entry.payloadBase64, view) : entry.text;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatByteSize(bytes: number): string {
  return bytes < BYTES_PER_KIBIBYTE ? `${bytes} B` : `${(bytes / BYTES_PER_KIBIBYTE).toFixed(1)} KB`;
}

export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function prettyJsonOrText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

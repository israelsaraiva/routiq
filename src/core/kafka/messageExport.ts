import { KafkaExportFormat } from '../../shared/kafkaProduceTypes';
import { KafkaMessage } from '../../shared/types';
import { resolveFlowId } from './flowId';
import { JsonLogEntry } from './jsonLogParser';
import { convertToKafkaMessages } from './splunkMessages';

export interface ExportedRecord {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  headers: Record<string, string>;
  value: string;
  timestamp: number | null;
  timestampIso: string | null;
  receivedAt: number;
  receivedAtIso: string;
}

const CSV_COLUMNS = ['topic', 'partition', 'offset', 'key', 'timestamp', 'timestampIso', 'receivedAt', 'receivedAtIso', 'headers', 'value'] as const;
const CSV_SPECIAL_CHARACTERS = /[",\r\n]/;

export const EXPORT_FORMAT_EXTENSIONS: Record<KafkaExportFormat, string> = { json: 'json', ndjson: 'ndjson', csv: 'csv' };

function isoOrNull(milliseconds: number | undefined): string | null {
  return milliseconds === undefined ? null : new Date(milliseconds).toISOString();
}

export function toExportedRecord(message: KafkaMessage): ExportedRecord {
  return {
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    key: message.key,
    headers: message.headers ?? {},
    value: message.value,
    timestamp: message.recordTimestamp ?? null,
    timestampIso: isoOrNull(message.recordTimestamp),
    receivedAt: message.timestamp,
    receivedAtIso: new Date(message.timestamp).toISOString(),
  };
}

export function escapeCsvField(text: string): string {
  return CSV_SPECIAL_CHARACTERS.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvCells(record: ExportedRecord): string[] {
  return CSV_COLUMNS.map((column) => {
    const cell = record[column];
    const text = column === 'headers' ? JSON.stringify(cell) : cell === null ? '' : String(cell);
    return escapeCsvField(text);
  });
}

export function exportAsJson(messages: KafkaMessage[]): string {
  return JSON.stringify(messages.map(toExportedRecord), null, 2);
}

export function exportAsNdjson(messages: KafkaMessage[]): string {
  return messages.map((message) => JSON.stringify(toExportedRecord(message))).join('\n') + (messages.length > 0 ? '\n' : '');
}

export function exportAsCsv(messages: KafkaMessage[]): string {
  const rows = messages.map((message) => csvCells(toExportedRecord(message)).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

export function serializeMessages(messages: KafkaMessage[], format: KafkaExportFormat): string {
  switch (format) {
    case 'json':
      return exportAsJson(messages);
    case 'ndjson':
      return exportAsNdjson(messages);
    case 'csv':
      return exportAsCsv(messages);
  }
}

export function exportFileName(baseName: string, format: KafkaExportFormat): string {
  return baseName.replace(/\.[^./\\]+$/, '') + `.${EXPORT_FORMAT_EXTENSIONS[format]}`;
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'number';
}

export function isExportedRecord(entry: unknown): entry is ExportedRecord {
  const candidate = entry as Partial<Record<keyof ExportedRecord, unknown>> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.topic === 'string' &&
    typeof candidate.partition === 'number' &&
    (typeof candidate.offset === 'string' || typeof candidate.offset === 'number') &&
    (typeof candidate.value === 'string' || candidate.value === null) &&
    isOptionalNumber(candidate.timestamp) &&
    isOptionalNumber(candidate.receivedAt) &&
    !('result' in candidate)
  );
}

function headersOf(record: ExportedRecord): Record<string, string> | undefined {
  const entries = Object.entries(record.headers ?? {}).map(([name, value]) => [name, String(value)]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function importExportedRecord(record: ExportedRecord): KafkaMessage {
  const value = record.value ?? '';
  const headers = headersOf(record);
  const key = record.key ?? null;
  const offset = String(record.offset);
  const { flowId, source } = resolveFlowId({ headers, value, key });
  return {
    id: `${record.topic}-${record.partition}-${offset}`,
    flowId,
    flowIdSource: source,
    timestamp: record.receivedAt ?? record.timestamp ?? 0,
    recordTimestamp: record.timestamp ?? undefined,
    topic: record.topic,
    partition: record.partition,
    offset,
    key,
    value,
    headers,
  };
}

export function messagesFromLogEntries(entries: JsonLogEntry[]): KafkaMessage[] {
  const candidates: unknown[] = entries;
  const exported = candidates.filter(isExportedRecord);
  const others = entries.filter((entry) => !isExportedRecord(entry));
  return [...exported.map(importExportedRecord), ...convertToKafkaMessages(others)];
}

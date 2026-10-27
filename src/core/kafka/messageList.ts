import { KafkaMessage } from '../../shared/types';
import { resolveFlowId } from './flowId';
import { captureBinaryValue } from './wireFormat';

export interface RawKafkaRecord {
  topic: string;
  partition: number;
  message: {
    offset: string;
    timestamp?: string;
    key: { toString(): string } | null;
    value: { toString(): string } | null;
    headers?: Record<string, { toString(): string } | { toString(): string }[] | undefined>;
  };
}

function headerText(value: { toString(): string } | { toString(): string }[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.toString() ?? '';
}

function toHeaderRecord(headers: RawKafkaRecord['message']['headers']): Record<string, string> | undefined {
  const entries = Object.entries(headers ?? {}).map(([name, value]) => [name, headerText(value)]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseRecordTimestamp(timestamp: string | undefined): number | undefined {
  const parsed = Number(timestamp);
  return timestamp !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildKafkaMessage({ topic, partition, message }: RawKafkaRecord, receivedAt: number): KafkaMessage {
  const key = message.key?.toString() || null;
  const value = message.value?.toString() ?? '';
  const headers = toHeaderRecord(message.headers);
  const recordTimestamp = parseRecordTimestamp(message.timestamp);
  const valueBase64 = captureBinaryValue(message.value);
  const { flowId, source } = resolveFlowId({ headers, value, key });
  return {
    id: `${topic}-${partition}-${message.offset}`,
    flowId,
    flowIdSource: source,
    timestamp: recordTimestamp ?? receivedAt,
    receivedAt,
    topic,
    partition,
    offset: String(message.offset),
    key,
    value,
    headers,
    ...(recordTimestamp !== undefined && { recordTimestamp }),
    ...(valueBase64 && { valueBase64 }),
  };
}

export function prependMessages(existing: KafkaMessage[], incoming: KafkaMessage[], limit: number): KafkaMessage[] {
  const known = new Set(existing.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id)).reverse();
  return limit > 0 ? [...fresh, ...existing].slice(0, limit) : [...fresh, ...existing];
}

export function replaceMessageById(messages: KafkaMessage[], replacement: KafkaMessage): KafkaMessage[] {
  return messages.map((message) => (message.id === replacement.id ? replacement : message));
}

export function removeMessages(messages: KafkaMessage[], messageIds: string[]): KafkaMessage[] {
  const doomed = new Set(messageIds);
  return messages.filter((message) => !doomed.has(message.id));
}

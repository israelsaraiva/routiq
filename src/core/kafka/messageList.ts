import { KafkaMessage } from '../../shared/types';
import { resolveFlowId } from './flowId';

export interface RawKafkaRecord {
  topic: string;
  partition: number;
  message: {
    offset: string;
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

export function buildKafkaMessage({ topic, partition, message }: RawKafkaRecord, receivedAt: number): KafkaMessage {
  const key = message.key?.toString() || null;
  const value = message.value?.toString() ?? '';
  const headers = toHeaderRecord(message.headers);
  const { flowId, source } = resolveFlowId({ headers, value, key });
  return {
    id: `${topic}-${partition}-${message.offset}`,
    flowId,
    flowIdSource: source,
    timestamp: receivedAt,
    topic,
    partition,
    offset: String(message.offset),
    key,
    value,
    headers,
  };
}

export function prependMessages(existing: KafkaMessage[], incoming: KafkaMessage[], limit: number): KafkaMessage[] {
  const known = new Set(existing.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id)).reverse();
  return limit > 0 ? [...fresh, ...existing].slice(0, limit) : [...fresh, ...existing];
}

export function removeMessages(messages: KafkaMessage[], messageIds: string[]): KafkaMessage[] {
  const doomed = new Set(messageIds);
  return messages.filter((message) => !doomed.has(message.id));
}

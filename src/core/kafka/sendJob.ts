import { KafkaAcks, KafkaCompression, KafkaSendJobRequest } from '../../shared/kafkaProduceTypes';
import { KafkaProfile } from '../../shared/types';

export const MAX_SEND_COUNT = 100000;
export const MAX_REPEAT_RUNS = 1000;
export const MIN_REPEAT_INTERVAL_MS = 100;
export const DEFAULT_REPEAT_RUNS = 10;

export const COMPRESSION_OPTIONS: Array<{ value: KafkaCompression; label: string }> = [
  { value: 'none', label: 'No compression' },
  { value: 'gzip', label: 'GZIP' },
];

export const ACKS_OPTIONS: Array<{ value: KafkaAcks; label: string }> = [
  { value: 'all', label: 'acks=all' },
  { value: 'leader', label: 'acks=leader' },
  { value: 'none', label: 'acks=none' },
];

export interface SendDraft {
  topic: string;
  key: string;
  headers: string;
  value: string;
  partition: string;
  count: string;
  delayMs: string;
  ratePerSecond: string;
  repeat: boolean;
  repeatIntervalSeconds: string;
  repeatMaxRuns: string;
  compression: KafkaCompression;
  acks: KafkaAcks;
  tombstone: boolean;
}

export const EMPTY_SEND_DRAFT: SendDraft = {
  topic: '',
  key: '',
  headers: '',
  value: '',
  partition: '',
  count: '1',
  delayMs: '',
  ratePerSecond: '',
  repeat: false,
  repeatIntervalSeconds: '5',
  repeatMaxRuns: String(DEFAULT_REPEAT_RUNS),
  compression: 'none',
  acks: 'all',
  tombstone: false,
};

export function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function parseNonNegativeNumber(text: string): number {
  const parsed = Number(text.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function buildSendJobRequest(jobId: string, profile: KafkaProfile, draft: SendDraft, headers: Record<string, string>): KafkaSendJobRequest {
  const repeatIntervalMs = draft.repeat ? Math.round(parseNonNegativeNumber(draft.repeatIntervalSeconds) * 1000) : 0;
  return {
    jobId,
    profile,
    topic: draft.topic,
    key: draft.key === '' ? null : draft.key,
    partition: parseWholeNumber(draft.partition),
    headers,
    value: draft.tombstone ? '' : draft.value,
    tombstone: draft.tombstone,
    count: parseWholeNumber(draft.count) ?? 0,
    delayMs: parseNonNegativeNumber(draft.delayMs),
    ratePerSecond: parseNonNegativeNumber(draft.ratePerSecond),
    repeatIntervalMs,
    repeatMaxRuns: draft.repeat ? (parseWholeNumber(draft.repeatMaxRuns) ?? 0) : 1,
    compression: draft.compression,
    acks: draft.acks,
  };
}

export function readOnlyReason(profile: Pick<KafkaProfile, 'name' | 'readOnly'> | undefined): string | undefined {
  return profile?.readOnly ? `Connection "${profile.name}" is read-only (never produce). Turn off "Read-only" in the connection settings to send or replay.` : undefined;
}

export function validateSendJob(request: KafkaSendJobRequest): string | undefined {
  const { topic, count, partition, tombstone, value, repeatIntervalMs, repeatMaxRuns } = request;
  const repeating = repeatIntervalMs > 0;
  if (!topic.trim()) {
    return 'Please provide a topic';
  }
  if (!tombstone && !value) {
    return 'Please provide a message value (or enable tombstone)';
  }
  if (count < 1 || count > MAX_SEND_COUNT) {
    return `Count must be between 1 and ${MAX_SEND_COUNT}`;
  }
  if (partition !== null && (!Number.isInteger(partition) || partition < 0)) {
    return 'Partition must be a non-negative whole number';
  }
  if (repeating && repeatIntervalMs < MIN_REPEAT_INTERVAL_MS) {
    return `Repeat interval must be at least ${MIN_REPEAT_INTERVAL_MS} ms`;
  }
  return repeating && (repeatMaxRuns < 1 || repeatMaxRuns > MAX_REPEAT_RUNS) ? `Repeat cap must be between 1 and ${MAX_REPEAT_RUNS} runs` : undefined;
}

export function totalMessages(request: Pick<KafkaSendJobRequest, 'count' | 'repeatMaxRuns' | 'repeatIntervalMs'>): number {
  return request.count * (request.repeatIntervalMs > 0 ? request.repeatMaxRuns : 1);
}

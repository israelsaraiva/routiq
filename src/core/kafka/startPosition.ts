import { KafkaProfile } from '../../shared/types';
import { KafkaStartMode } from '../../shared/kafkaEngineTypes';

export interface OffsetEntry {
  topic?: string;
  partition?: number;
  offset: string;
}

export type StartPosition =
  | { kind: 'latest' }
  | { kind: 'beginning' }
  | { kind: 'offsets'; entries: OffsetEntry[] }
  | { kind: 'timestamp'; timestamp: number }
  | { kind: 'lastN'; count: number };

export interface PartitionWatermarks {
  partition: number;
  low: string;
  high: string;
}

export interface PartitionOffset {
  partition: number;
  offset: string;
}

export interface TopicSeek {
  topic: string;
  partition: number;
  offset: string;
}

export const START_MODE_OPTIONS: Array<{ value: KafkaStartMode; label: string }> = [
  { value: 'latest', label: 'Latest (new messages only)' },
  { value: 'beginning', label: 'From beginning' },
  { value: 'offset', label: 'From specific offset(s)' },
  { value: 'timestamp', label: 'From timestamp' },
  { value: 'lastN', label: 'Last N messages per partition' },
];

const DIGITS = /^\d+$/;

export function resolveStartMode(profile: Pick<KafkaProfile, 'startMode' | 'fromBeginning'>): KafkaStartMode {
  return profile.startMode ?? (profile.fromBeginning ? 'beginning' : 'latest');
}

export function parseOffsetEntry(text: string): OffsetEntry | undefined {
  const parts = text.split(':').map((part) => part.trim());
  const offset = parts[parts.length - 1];
  const partition = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  const topic = parts.length === 3 ? parts[0] : undefined;
  const valid = parts.length <= 3 && DIGITS.test(offset) && (partition === undefined || DIGITS.test(partition)) && (topic === undefined || topic !== '');
  return valid ? { topic, partition: partition === undefined ? undefined : Number(partition), offset } : undefined;
}

export function parseStartOffsets(text: string): { entries: OffsetEntry[]; error?: string } {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const entries = tokens.map(parseOffsetEntry);
  const invalid = tokens.find((_, index) => entries[index] === undefined);
  if (invalid !== undefined) {
    return { entries: [], error: `Invalid offset "${invalid}". Use offset, partition:offset or topic:partition:offset.` };
  }
  return entries.length === 0 ? { entries: [], error: 'Enter at least one offset.' } : { entries: entries as OffsetEntry[] };
}

export function parseStartTimestamp(text: string): number | undefined {
  const trimmed = text.trim();
  const parsed = DIGITS.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
  return Number.isFinite(parsed) && trimmed !== '' ? parsed : undefined;
}

export function validateStartPosition(profile: KafkaProfile): string | undefined {
  switch (resolveStartMode(profile)) {
    case 'offset':
      return parseStartOffsets(profile.startOffsets ?? '').error;
    case 'timestamp':
      return parseStartTimestamp(profile.startTimestamp ?? '') === undefined ? 'Enter the start time as an ISO date (2024-05-01T10:00:00Z) or epoch milliseconds.' : undefined;
    case 'lastN':
      return Number.isInteger(profile.startLastN) && (profile.startLastN ?? 0) > 0 ? undefined : 'Enter how many recent messages per partition to read (a positive number).';
    default:
      return undefined;
  }
}

export function buildStartPosition(profile: KafkaProfile): StartPosition {
  const mode = resolveStartMode(profile);
  switch (mode) {
    case 'offset':
      return { kind: 'offsets', entries: parseStartOffsets(profile.startOffsets ?? '').entries };
    case 'timestamp':
      return { kind: 'timestamp', timestamp: parseStartTimestamp(profile.startTimestamp ?? '') ?? 0 };
    case 'lastN':
      return { kind: 'lastN', count: profile.startLastN ?? 1 };
    default:
      return { kind: mode };
  }
}

export function needsOffsetLookup(position: StartPosition): boolean {
  return position.kind === 'offsets' || position.kind === 'timestamp' || position.kind === 'lastN';
}

function clamp(offset: bigint, low: bigint, high: bigint): bigint {
  return offset < low ? low : offset > high ? high : offset;
}

function entrySpecificity(entry: OffsetEntry): number {
  return (entry.topic === undefined ? 0 : 2) + (entry.partition === undefined ? 0 : 1);
}

function findEntry(entries: OffsetEntry[], topic: string, partition: number): OffsetEntry | undefined {
  const matching = entries.filter((entry) => (entry.topic === undefined || entry.topic === topic) && (entry.partition === undefined || entry.partition === partition));
  return matching.sort((left, right) => entrySpecificity(right) - entrySpecificity(left))[0];
}

function seekOf(topic: string, partition: number, offset: bigint): TopicSeek {
  return { topic, partition, offset: offset.toString() };
}

function planFromOffsets(entries: OffsetEntry[], topic: string, watermarks: PartitionWatermarks[]): TopicSeek[] {
  return watermarks.flatMap(({ partition, low, high }) => {
    const entry = findEntry(entries, topic, partition);
    return entry ? [seekOf(topic, partition, clamp(BigInt(entry.offset), BigInt(low), BigInt(high)))] : [];
  });
}

function planFromLastN(count: number, topic: string, watermarks: PartitionWatermarks[]): TopicSeek[] {
  return watermarks.map(({ partition, low, high }) => seekOf(topic, partition, clamp(BigInt(high) - BigInt(count), BigInt(low), BigInt(high))));
}

function planFromTimestamps(topic: string, watermarks: PartitionWatermarks[], found: PartitionOffset[]): TopicSeek[] {
  return watermarks.map(({ partition, low, high }) => {
    const match = found.find((candidate) => candidate.partition === partition);
    const offset = match && BigInt(match.offset) >= 0n ? BigInt(match.offset) : BigInt(high);
    return seekOf(topic, partition, clamp(offset, BigInt(low), BigInt(high)));
  });
}

export function planSeeks(position: StartPosition, topic: string, watermarks: PartitionWatermarks[], offsetsByTimestamp: PartitionOffset[] = []): TopicSeek[] {
  switch (position.kind) {
    case 'offsets':
      return planFromOffsets(position.entries, topic, watermarks);
    case 'lastN':
      return planFromLastN(position.count, topic, watermarks);
    case 'timestamp':
      return planFromTimestamps(topic, watermarks, offsetsByTimestamp);
    default:
      return [];
  }
}

export function effectiveStartPosition(config: { startPosition?: StartPosition; fromBeginning: boolean }): StartPosition {
  return config.startPosition ?? { kind: config.fromBeginning ? 'beginning' : 'latest' };
}

export function describeStartPosition(position: StartPosition | undefined): string | undefined {
  switch (position?.kind) {
    case 'beginning':
      return 'from beginning';
    case 'offsets':
      return 'from specific offsets';
    case 'timestamp':
      return `from ${new Date(position.timestamp).toISOString()}`;
    case 'lastN':
      return `last ${position.count} per partition`;
    default:
      return undefined;
  }
}

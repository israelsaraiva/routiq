import { KafkaAcks, KafkaCompression, KafkaReplayPartitionMode } from '../../shared/kafkaProduceTypes';
import { KafkaMessage, KafkaProfile } from '../../shared/types';
import { parseBrokerList } from './connection';
import { readOnlyReason } from './sendJob';
import { isTombstone } from './tombstone';

export const SPLUNK_PSEUDO_TOPIC = 'splunk-json';

export interface ReplayRecord {
  topic: string;
  key: string | null;
  value: string | null;
  headers: Record<string, string>;
  partition?: number;
  timestamp?: number;
  compression: KafkaCompression;
  acks: KafkaAcks;
  sourceId: string;
}

export interface ReplayOptions {
  messages: KafkaMessage[];
  sourceProfile?: Pick<KafkaProfile, 'id' | 'brokers'>;
  targetProfile: Pick<KafkaProfile, 'id' | 'name' | 'brokers' | 'readOnly'>;
  targetTopic: string;
  partitionMode: KafkaReplayPartitionMode;
  explicitPartition: number | null;
  keepTimestamps: boolean;
  compression: KafkaCompression;
  acks: KafkaAcks;
}

export interface ReplayPlan {
  records: ReplayRecord[];
  count: number;
  skipped: number;
  sourceTopics: string[];
  sameConnection: boolean;
  sameTopic: boolean;
  blockedReason?: string;
}

function numericOffset(message: KafkaMessage): number {
  const offset = Number(message.offset);
  return Number.isFinite(offset) ? offset : 0;
}

function recordOrder(left: KafkaMessage, right: KafkaMessage): number {
  const leftTime = left.recordTimestamp ?? left.timestamp;
  const rightTime = right.recordTimestamp ?? right.timestamp;
  if (left.topic === right.topic && left.partition === right.partition) {
    return numericOffset(left) - numericOffset(right);
  }
  return leftTime - rightTime || left.partition - right.partition || numericOffset(left) - numericOffset(right);
}

export function sortChronologically(messages: KafkaMessage[]): KafkaMessage[] {
  return [...messages].sort(recordOrder);
}

export function isReplayable(message: KafkaMessage): boolean {
  return message.topic !== '' && message.topic !== SPLUNK_PSEUDO_TOPIC;
}

function partitionFor(message: KafkaMessage, options: ReplayOptions): number | undefined {
  switch (options.partitionMode) {
    case 'original':
      return message.partition;
    case 'explicit':
      return options.explicitPartition ?? undefined;
    case 'auto':
      return undefined;
  }
}

function toReplayRecord(message: KafkaMessage, options: ReplayOptions): ReplayRecord {
  return {
    topic: options.targetTopic.trim(),
    key: message.key,
    value: isTombstone(message) ? null : message.value,
    headers: message.headers ?? {},
    partition: partitionFor(message, options),
    timestamp: options.keepTimestamps ? (message.recordTimestamp ?? message.timestamp) : undefined,
    compression: options.compression,
    acks: options.acks,
    sourceId: message.id,
  };
}

function blockedReasonFor(options: ReplayOptions, count: number): string | undefined {
  const readOnly = readOnlyReason(options.targetProfile);
  if (readOnly) {
    return readOnly;
  }
  if (!options.targetTopic.trim()) {
    return 'Choose a target topic';
  }
  if (options.partitionMode === 'explicit' && (options.explicitPartition === null || options.explicitPartition < 0)) {
    return 'Provide a valid target partition';
  }
  return count === 0 ? 'No replayable messages selected' : undefined;
}

function normalizedBrokers(brokers: string): string {
  return parseBrokerList(brokers).map((broker) => broker.toLowerCase()).sort().join(',');
}

function isSameCluster(source: ReplayOptions['sourceProfile'], target: ReplayOptions['targetProfile']): boolean {
  if (!source) {
    return false;
  }
  const sourceBrokers = normalizedBrokers(source.brokers);
  return source.id === target.id || (sourceBrokers !== '' && sourceBrokers === normalizedBrokers(target.brokers));
}

export function planReplay(options: ReplayOptions): ReplayPlan {
  const replayable = sortChronologically(options.messages.filter(isReplayable));
  const sourceTopics = [...new Set(replayable.map((message) => message.topic))];
  const sameConnection = isSameCluster(options.sourceProfile, options.targetProfile);
  return {
    records: replayable.map((message) => toReplayRecord(message, options)),
    count: replayable.length,
    skipped: options.messages.length - replayable.length,
    sourceTopics,
    sameConnection,
    sameTopic: sameConnection && sourceTopics.includes(options.targetTopic.trim()),
    blockedReason: blockedReasonFor(options, replayable.length),
  };
}

export function describeReplayTarget(clusterName: string, brokers: string, topic: string, count: number): string {
  return `Replay ${count} message${count === 1 ? '' : 's'} to topic "${topic}" on "${clusterName}" (${brokers})?`;
}

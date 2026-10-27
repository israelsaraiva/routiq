import type { KafkaMessage, KafkaProfileDraft } from './types';

export type KafkaCompression = 'none' | 'gzip';
export type KafkaAcks = 'all' | 'leader' | 'none';
export type KafkaExportFormat = 'json' | 'ndjson' | 'csv';
export type KafkaReplayPartitionMode = 'auto' | 'original' | 'explicit';
export type KafkaJobKind = 'send' | 'replay';
export type KafkaJobState = 'running' | 'done' | 'stopped' | 'failed';

export interface KafkaSendJobRequest {
  jobId: string;
  profile: KafkaProfileDraft;
  topic: string;
  key: string | null;
  partition: number | null;
  headers: Record<string, string>;
  value: string;
  tombstone: boolean;
  count: number;
  delayMs: number;
  ratePerSecond: number;
  repeatIntervalMs: number;
  repeatMaxRuns: number;
  compression: KafkaCompression;
  acks: KafkaAcks;
}

export interface KafkaReplayRequest {
  jobId: string;
  sourceProfile?: Pick<KafkaProfileDraft, 'id' | 'brokers'>;
  targetProfile: KafkaProfileDraft;
  targetTopic: string;
  messages: KafkaMessage[];
  partitionMode: KafkaReplayPartitionMode;
  explicitPartition: number | null;
  keepTimestamps: boolean;
  ratePerSecond: number;
  compression: KafkaCompression;
  acks: KafkaAcks;
}

export interface KafkaJobOutcome {
  index: number;
  ok: boolean;
  partition?: number;
  offset?: string;
  error?: string;
}

export interface KafkaJobProgress {
  jobId: string;
  kind: KafkaJobKind;
  state: KafkaJobState;
  topic: string;
  sent: number;
  failed: number;
  total: number;
  run: number;
  runs: number;
  partitionCounts: Record<string, number>;
  errors: string[];
  recent: KafkaJobOutcome[];
  detail?: string;
}

export interface KafkaSendTemplate {
  id: string;
  name: string;
  topic: string;
  key: string;
  headers: Record<string, string>;
  value: string;
  partition: number | null;
  tombstone: boolean;
}

export type KafkaProduceHostMessage =
  | { type: 'kafkaJobProgress'; progress: KafkaJobProgress }
  | { type: 'kafkaTemplates'; templates: KafkaSendTemplate[] };

export type KafkaProduceWebviewMessage =
  | { type: 'kafkaSend'; request: KafkaSendJobRequest }
  | { type: 'kafkaReplay'; request: KafkaReplayRequest }
  | { type: 'kafkaStopJob'; jobId: string }
  | { type: 'kafkaExportMessages'; format: KafkaExportFormat; suggestedName: string; messages: KafkaMessage[] }
  | { type: 'kafkaSaveTemplate'; template: KafkaSendTemplate }
  | { type: 'kafkaDeleteTemplate'; templateId: string };

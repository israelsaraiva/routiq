import { Admin, CompressionTypes, Consumer, Kafka, KafkaConfig, logLevel } from 'kafkajs';
import { KafkaAcks, KafkaCompression } from '../shared/kafkaProduceTypes';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { RawKafkaRecord } from '../core/kafka/messageList';
import { PartitionOffset, PartitionWatermarks } from '../core/kafka/startPosition';
import { buildKafkaSasl, buildTlsOptions } from './kafkaAuth';
import { registerCompressionCodecs } from './kafkaCodecs';

export interface KafkaConsumerLike {
  connect(): Promise<void>;
  subscribe(subscription: { topics: string[]; fromBeginning: boolean }): Promise<void>;
  run(handlers: { eachMessage(record: RawKafkaRecord): Promise<void> }): Promise<void>;
  stop(): Promise<void>;
  disconnect(): Promise<void>;
  seek(topic: string, partition: number, offset: string): void;
  onCrash(listener: (error: Error) => void): void;
}

export interface KafkaProducedRecord {
  topic: string;
  key: string | null;
  value: string | null;
  headers: Record<string, string>;
  partition?: number;
  timestamp?: number;
  compression?: KafkaCompression;
  acks?: KafkaAcks;
}

export interface KafkaRecordMetadata {
  partition?: number;
  offset?: string;
}

const ACKS_VALUES: Record<KafkaAcks, number> = { all: -1, leader: 1, none: 0 };

export interface KafkaProducerLike {
  connect(): Promise<void>;
  send(record: KafkaProducedRecord): Promise<KafkaRecordMetadata>;
  disconnect(): Promise<void>;
}

export interface KafkaOffsetLookupLike {
  connect(): Promise<void>;
  watermarks(topic: string): Promise<PartitionWatermarks[]>;
  offsetsAtTimestamp(topic: string, timestamp: number): Promise<PartitionOffset[]>;
  disconnect(): Promise<void>;
}

export interface KafkaClientLike {
  createOffsetLookup(): KafkaOffsetLookupLike;
  createConsumer(groupId: string): KafkaConsumerLike;
  createProducer(): KafkaProducerLike;
}

export type KafkaClientFactory = (config: KafkaConnectionConfig, clientId: string, timeoutMs: number) => KafkaClientLike;

const SESSION_TIMEOUT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 3000;
const MAX_FETCH_WAIT_MS = 500;
const CLIENT_RETRY = { initialRetryTime: 300, retries: 3 };
const TOPIC_CREATION_ATTEMPTS = 5;
const TOPIC_CREATION_DELAY_MS = 500;
const UNKNOWN_TOPIC_ERROR_TYPE = 'UNKNOWN_TOPIC_OR_PARTITION';

function isUnknownTopicError(error: unknown): boolean {
  return (error as { type?: string } | null)?.type === UNKNOWN_TOPIC_ERROR_TYPE;
}

export async function retryWhileTopicIsCreated(operation: () => Promise<void>, attempts = TOPIC_CREATION_ATTEMPTS, delayMs = TOPIC_CREATION_DELAY_MS): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isUnknownTopicError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export function toKafkaConfig(config: KafkaConnectionConfig, clientId: string, timeoutMs: number): KafkaConfig {
  return {
    clientId,
    brokers: config.brokers,
    ssl: config.tls ? buildTlsOptions(config.tls) : config.ssl,
    sasl: buildKafkaSasl(config.sasl),
    connectionTimeout: timeoutMs,
    requestTimeout: timeoutMs,
    retry: CLIENT_RETRY,
    logLevel: logLevel.NOTHING,
  };
}

function wrapConsumer(consumer: Consumer): KafkaConsumerLike {
  return {
    connect: () => consumer.connect(),
    subscribe: (subscription) => retryWhileTopicIsCreated(() => consumer.subscribe(subscription)),
    run: ({ eachMessage }) => consumer.run({ eachMessage: ({ topic, partition, message }) => eachMessage({ topic, partition, message }) }),
    seek: (topic, partition, offset) => consumer.seek({ topic, partition, offset }),
    stop: () => consumer.stop(),
    disconnect: () => consumer.disconnect(),
    onCrash: (listener) => void consumer.on(consumer.events.CRASH, ({ payload }) => listener(payload.error)),
  };
}

function wrapOffsetLookup(admin: Admin): KafkaOffsetLookupLike {
  return {
    connect: () => admin.connect(),
    watermarks: async (topic) => (await admin.fetchTopicOffsets(topic)).map(({ partition, low, high }) => ({ partition, low, high })),
    offsetsAtTimestamp: async (topic, timestamp) => (await admin.fetchTopicOffsetsByTimestamp(topic, timestamp)).map(({ partition, offset }) => ({ partition, offset })),
    disconnect: () => admin.disconnect(),
  };
}

export const createKafkaClient: KafkaClientFactory = (config, clientId, timeoutMs) => {
  registerCompressionCodecs();
  const kafka = new Kafka(toKafkaConfig(config, clientId, timeoutMs));
  return {
    createOffsetLookup: () => wrapOffsetLookup(kafka.admin()),
    createConsumer: (groupId) => wrapConsumer(kafka.consumer({ groupId, sessionTimeout: SESSION_TIMEOUT_MS, heartbeatInterval: HEARTBEAT_INTERVAL_MS, maxWaitTimeInMs: MAX_FETCH_WAIT_MS, retry: { ...CLIENT_RETRY, restartOnFailure: async () => false } })),
    createProducer: () => {
      const producer = kafka.producer();
      return {
        connect: () => producer.connect(),
        disconnect: () => producer.disconnect(),
        send: async ({ topic, key, value, headers, partition, timestamp, compression, acks }) => {
          const [metadata] = await producer.send({
            topic,
            messages: [{ key, value, headers, partition, timestamp: timestamp === undefined ? undefined : String(timestamp) }],
            acks: ACKS_VALUES[acks ?? 'all'],
            compression: compression === 'gzip' ? CompressionTypes.GZIP : CompressionTypes.None,
          });
          return { partition: metadata?.partition, offset: metadata?.offset };
        },
      };
    },
  };
};

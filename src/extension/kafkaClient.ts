import { Consumer, Kafka, KafkaConfig, logLevel } from 'kafkajs';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { RawKafkaRecord } from '../core/kafka/messageList';

export interface KafkaConsumerLike {
  connect(): Promise<void>;
  subscribe(subscription: { topics: string[]; fromBeginning: boolean }): Promise<void>;
  run(handlers: { eachMessage(record: RawKafkaRecord): Promise<void> }): Promise<void>;
  stop(): Promise<void>;
  disconnect(): Promise<void>;
  onCrash(listener: (error: Error) => void): void;
}

export interface KafkaProducedRecord {
  topic: string;
  key: string | null;
  value: string;
  headers: Record<string, string>;
}

export interface KafkaRecordMetadata {
  partition: number;
  offset?: string;
}

export interface KafkaProducerLike {
  connect(): Promise<void>;
  send(record: KafkaProducedRecord): Promise<KafkaRecordMetadata>;
  disconnect(): Promise<void>;
}

export interface KafkaClientLike {
  createConsumer(groupId: string): KafkaConsumerLike;
  createProducer(): KafkaProducerLike;
}

export type KafkaClientFactory = (config: KafkaConnectionConfig, clientId: string, timeoutMs: number) => KafkaClientLike;

const SESSION_TIMEOUT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 3000;
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

function toKafkaConfig(config: KafkaConnectionConfig, clientId: string, timeoutMs: number): KafkaConfig {
  const { sasl } = config;
  return {
    clientId,
    brokers: config.brokers,
    ssl: config.ssl,
    sasl: sasl && ({ mechanism: sasl.mechanism, username: sasl.username, password: sasl.password } as KafkaConfig['sasl']),
    connectionTimeout: timeoutMs,
    requestTimeout: timeoutMs,
    logLevel: logLevel.NOTHING,
  };
}

function wrapConsumer(consumer: Consumer): KafkaConsumerLike {
  return {
    connect: () => consumer.connect(),
    subscribe: (subscription) => retryWhileTopicIsCreated(() => consumer.subscribe(subscription)),
    run: ({ eachMessage }) => consumer.run({ eachMessage: ({ topic, partition, message }) => eachMessage({ topic, partition, message }) }),
    stop: () => consumer.stop(),
    disconnect: () => consumer.disconnect(),
    onCrash: (listener) => void consumer.on(consumer.events.CRASH, ({ payload }) => listener(payload.error)),
  };
}

export const createKafkaClient: KafkaClientFactory = (config, clientId, timeoutMs) => {
  const kafka = new Kafka(toKafkaConfig(config, clientId, timeoutMs));
  return {
    createConsumer: (groupId) => wrapConsumer(kafka.consumer({ groupId, sessionTimeout: SESSION_TIMEOUT_MS, heartbeatInterval: HEARTBEAT_INTERVAL_MS })),
    createProducer: () => {
      const producer = kafka.producer();
      return {
        connect: () => producer.connect(),
        disconnect: () => producer.disconnect(),
        send: async ({ topic, key, value, headers }) => {
          const [metadata] = await producer.send({ topic, messages: [{ key, value, headers }] });
          return { partition: metadata.partition, offset: metadata.offset };
        },
      };
    },
  };
};

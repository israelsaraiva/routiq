import { KafkaConnectionConfig, describeKafkaError } from '../core/kafka/connection';
import { buildKafkaMessage } from '../core/kafka/messageList';
import { KafkaMessage, KafkaProduceResult, KafkaStatus } from '../shared/types';
import { KafkaClientFactory, KafkaConsumerLike, KafkaProducedRecord } from './kafkaClient';
import { generateId } from '../core/ids';

export interface KafkaSessionEvents {
  onMessage(message: KafkaMessage): void;
  onStatus(status: KafkaStatus): void;
}

export interface KafkaSessionOptions {
  connectionTimeoutMs: number;
  now?: () => number;
}

const CONSUMER_CLIENT_ID = 'routiq-consumer';
const PRODUCER_CLIENT_ID = 'routiq-producer';
const GROUP_PREFIX = 'routiq-';

function withTimeout<Value>(work: Promise<Value>, timeoutMs: number): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export class KafkaSession {
  private consumer: KafkaConsumerLike | undefined;
  private generation = 0;

  constructor(
    private readonly createClient: KafkaClientFactory,
    private readonly events: KafkaSessionEvents,
    private readonly options: KafkaSessionOptions,
  ) {}

  get isActive(): boolean {
    return this.consumer !== undefined;
  }

  async connect(config: KafkaConnectionConfig): Promise<void> {
    await this.disconnect(false);
    const generation = ++this.generation;
    this.events.onStatus({ state: 'connecting' });
    const consumer = this.createClient(config, CONSUMER_CLIENT_ID, this.options.connectionTimeoutMs).createConsumer(config.groupId ?? `${GROUP_PREFIX}${generateId()}`);
    this.consumer = consumer;
    try {
      await this.startConsuming(consumer, config, generation);
      this.events.onStatus({ state: 'connected', detail: config.fromBeginning ? 'from beginning' : undefined });
    } catch (error) {
      await this.release(consumer);
      this.consumer = this.consumer === consumer ? undefined : this.consumer;
      this.events.onStatus({ state: 'error', detail: this.describeStartFailure(error) });
    }
  }

  async disconnect(announce = true): Promise<void> {
    const consumer = this.consumer;
    this.consumer = undefined;
    this.generation++;
    if (consumer) {
      await this.release(consumer);
    }
    announce && this.events.onStatus({ state: 'disconnected' });
  }

  async produce(config: KafkaConnectionConfig, record: KafkaProducedRecord, requestId: string): Promise<KafkaProduceResult> {
    const producer = this.createClient(config, PRODUCER_CLIENT_ID, this.options.connectionTimeoutMs).createProducer();
    try {
      await producer.connect();
      const { partition, offset } = await producer.send(record);
      return { requestId, ok: true, topic: record.topic, partition, offset };
    } catch (error) {
      return { requestId, ok: false, topic: record.topic, error: describeKafkaError(error) };
    } finally {
      await producer.disconnect().catch(() => undefined);
    }
  }

  private async startConsuming(consumer: KafkaConsumerLike, config: KafkaConnectionConfig, generation: number): Promise<void> {
    const { connectionTimeoutMs } = this.options;
    await withTimeout(consumer.connect(), connectionTimeoutMs);
    await consumer.subscribe({ topics: config.topics, fromBeginning: config.fromBeginning });
    consumer.onCrash((error) => this.handleRunFailure(consumer, error));
    await consumer.run({
      eachMessage: async (record) => {
        generation === this.generation && this.events.onMessage(buildKafkaMessage(record, (this.options.now ?? Date.now)()));
      },
    });
  }

  private handleRunFailure(consumer: KafkaConsumerLike, error: unknown): void {
    if (this.consumer === consumer) {
      this.consumer = undefined;
      this.events.onStatus({ state: 'error', detail: describeKafkaError(error) });
      void this.release(consumer);
    }
  }

  private describeStartFailure(error: unknown): string {
    const reason = describeKafkaError(error);
    return reason.startsWith('Cannot connect') || reason.startsWith('Connection timeout') ? reason : `Failed to connect to Kafka broker: ${reason}`;
  }

  private async release(consumer: KafkaConsumerLike): Promise<void> {
    await consumer.stop().catch(() => undefined);
    await consumer.disconnect().catch(() => undefined);
  }
}

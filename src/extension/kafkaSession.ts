import { RECONNECT_BACKOFF, nextBackoffDelay } from '../core/kafka/backoff';
import { KafkaConnectionConfig, describeKafkaError, isFatalKafkaError } from '../core/kafka/connection';
import { buildKafkaMessage } from '../core/kafka/messageList';
import { ResumePoints } from '../core/kafka/resumePoints';
import { TopicSeek, describeStartPosition, effectiveStartPosition, needsOffsetLookup, planSeeks } from '../core/kafka/startPosition';
import { KafkaMessage, KafkaProduceResult, KafkaStatus } from '../shared/types';
import { KafkaClientLike, KafkaClientFactory, KafkaConsumerLike, KafkaProducedRecord } from './kafkaClient';
import { generateId } from '../core/ids';

export interface KafkaSessionEvents {
  onMessage(message: KafkaMessage): void;
  onStatus(status: KafkaStatus): void;
}

export interface KafkaSessionOptions {
  connectionTimeoutMs: number;
  now?: () => number;
  random?: () => number;
  decodeMessage?: (message: KafkaMessage) => Promise<KafkaMessage>;
}

interface ConsumeTarget {
  config: KafkaConnectionConfig;
  groupId: string;
}

const CONSUMER_CLIENT_ID = 'routiq-consumer';
const PRODUCER_CLIENT_ID = 'routiq-producer';
const GROUP_PREFIX = 'routiq-';
const SUPERSEDED = 'Superseded';

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
  private target: ConsumeTarget | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnecting = false;
  private attempt = 0;
  private resumePoints = new ResumePoints();

  constructor(
    private readonly createClient: KafkaClientFactory,
    private readonly events: KafkaSessionEvents,
    private readonly options: KafkaSessionOptions,
  ) {}

  get isActive(): boolean {
    return this.consumer !== undefined || this.reconnecting;
  }

  async connect(config: KafkaConnectionConfig): Promise<void> {
    await this.disconnect(false);
    const generation = ++this.generation;
    this.resumePoints = new ResumePoints();
    this.attempt = 0;
    this.target = { config, groupId: config.groupId ?? `${GROUP_PREFIX}${generateId()}` };
    this.events.onStatus({ state: 'connecting' });
    try {
      await this.openConsumer(generation);
      this.events.onStatus({ state: 'connected', detail: describeStartPosition(effectiveStartPosition(config)) });
    } catch (error) {
      generation === this.generation && this.events.onStatus({ state: 'error', detail: this.describeStartFailure(error) });
    }
  }

  async disconnect(announce = true): Promise<void> {
    const consumer = this.consumer;
    this.consumer = undefined;
    this.generation++;
    this.cancelReconnect();
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

  private async openConsumer(generation: number): Promise<void> {
    const { config, groupId } = this.target as ConsumeTarget;
    const client = this.createClient(config, CONSUMER_CLIENT_ID, this.options.connectionTimeoutMs);
    const consumer = client.createConsumer(groupId);
    this.consumer = consumer;
    try {
      await this.startConsuming(client, consumer, config, generation);
    } catch (error) {
      await this.release(consumer);
      this.consumer = this.consumer === consumer ? undefined : this.consumer;
      throw error;
    }
  }

  private async startConsuming(client: KafkaClientLike, consumer: KafkaConsumerLike, config: KafkaConnectionConfig, generation: number): Promise<void> {
    await withTimeout(consumer.connect(), this.options.connectionTimeoutMs);
    await consumer.subscribe({ topics: config.topics, fromBeginning: config.fromBeginning });
    const seeks = await this.planSeeks(client, config);
    this.assertCurrent(generation);
    consumer.onCrash((error) => this.handleCrash(consumer, error));
    await consumer.run({ eachMessage: (record) => this.deliver(consumer, record) });
    this.assertCurrent(generation);
    [...seeks, ...this.resumePoints.toSeeks()].forEach(({ topic, partition, offset }) => consumer.seek(topic, partition, offset));
  }

  private async deliver(consumer: KafkaConsumerLike, record: Parameters<typeof buildKafkaMessage>[0]): Promise<void> {
    const built = buildKafkaMessage(record, (this.options.now ?? Date.now)());
    const message = this.options.decodeMessage ? await this.options.decodeMessage(built) : built;
    if (this.consumer === consumer) {
      this.resumePoints.record(record.topic, record.partition, record.message.offset);
      this.events.onMessage(message);
    }
  }

  private async planSeeks(client: KafkaClientLike, config: KafkaConnectionConfig): Promise<TopicSeek[]> {
    const position = effectiveStartPosition(config);
    if (!needsOffsetLookup(position)) {
      return [];
    }
    const lookup = client.createOffsetLookup();
    try {
      await withTimeout(lookup.connect(), this.options.connectionTimeoutMs);
      const perTopic = await Promise.all(
        config.topics.map(async (topic) => {
          const watermarks = await lookup.watermarks(topic);
          const found = position.kind === 'timestamp' ? await lookup.offsetsAtTimestamp(topic, position.timestamp) : [];
          return planSeeks(position, topic, watermarks, found);
        }),
      );
      return perTopic.flat();
    } finally {
      await lookup.disconnect().catch(() => undefined);
    }
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) {
      throw new Error(SUPERSEDED);
    }
  }

  private handleCrash(consumer: KafkaConsumerLike, error: unknown): void {
    if (this.consumer !== consumer) {
      return;
    }
    this.consumer = undefined;
    void this.release(consumer);
    this.scheduleReconnect(error);
  }

  private scheduleReconnect(reason: unknown): void {
    if (isFatalKafkaError(reason) || !this.target) {
      this.failPermanently(reason);
      return;
    }
    const generation = this.generation;
    const attempt = ++this.attempt;
    const delayMs = nextBackoffDelay(attempt, RECONNECT_BACKOFF, this.options.random);
    this.reconnecting = true;
    const nextRetryAt = (this.options.now ?? Date.now)() + delayMs;
    this.events.onStatus({ state: 'reconnecting', attempt, nextRetryAt, detail: describeKafkaError(reason) });
    this.reconnectTimer = setTimeout(() => void this.reconnect(generation), delayMs);
  }

  private async reconnect(generation: number): Promise<void> {
    this.reconnectTimer = undefined;
    if (generation !== this.generation || !this.target) {
      return;
    }
    this.events.onStatus({ state: 'reconnecting', attempt: this.attempt, detail: 'Retrying…' });
    try {
      await this.openConsumer(generation);
      this.reconnecting = false;
      this.attempt = 0;
      this.events.onStatus({ state: 'connected', detail: 'resumed after reconnect' });
    } catch (error) {
      generation === this.generation && this.scheduleReconnect(error);
    }
  }

  private failPermanently(reason: unknown): void {
    this.reconnecting = false;
    this.events.onStatus({ state: 'error', detail: describeKafkaError(reason) });
  }

  private cancelReconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.reconnecting = false;
  }

  private describeStartFailure(error: unknown): string {
    const reason = describeKafkaError(error);
    return /^(Cannot connect|Connection timeout|Authentication failed|TLS error)/.test(reason) ? reason : `Failed to connect to Kafka broker: ${reason}`;
  }

  private async release(consumer: KafkaConsumerLike): Promise<void> {
    await consumer.stop().catch(() => undefined);
    await consumer.disconnect().catch(() => undefined);
  }
}

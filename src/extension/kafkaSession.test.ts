import { describe, expect, it, vi } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { KafkaMessage, KafkaStatus } from '../shared/types';
import { KafkaClientFactory, KafkaConsumerLike } from './kafkaClient';
import { KafkaSession } from './kafkaSession';

const config: KafkaConnectionConfig = { brokers: ['b:9092'], topics: ['t'], fromBeginning: true, ssl: false };

function setup(overrides: Partial<KafkaConsumerLike> = {}) {
  let handler: Parameters<KafkaConsumerLike['run']>[0]['eachMessage'] = async () => undefined;
  let crash: (error: Error) => void = () => undefined;
  const consumer: KafkaConsumerLike = {
    connect: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => undefined),
    run: vi.fn(async (handlers) => void (handler = handlers.eachMessage)),
    stop: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    onCrash: (listener) => void (crash = listener),
    ...overrides,
  };
  const producer = { connect: vi.fn(async () => undefined), send: vi.fn(async () => ({ partition: 1, offset: '5' })), disconnect: vi.fn(async () => undefined) };
  const groups: string[] = [];
  const factory: KafkaClientFactory = () => ({ createConsumer: (groupId) => (groups.push(groupId), consumer), createProducer: () => producer });
  const statuses: KafkaStatus[] = [];
  const messages: KafkaMessage[] = [];
  const session = new KafkaSession(factory, { onMessage: (message) => messages.push(message), onStatus: (status) => statuses.push(status) }, { connectionTimeoutMs: 50, now: () => 7 });
  return { session, consumer, producer, statuses, messages, groups, emit: (offset: string) => handler({ topic: 't', partition: 0, message: { offset, key: null, value: Buffer.from('{"flowId":"f1"}') } }), crash: (error: Error) => crash(error) };
}

describe('KafkaSession', () => {
  it('connects, subscribes and forwards messages', async () => {
    const { session, consumer, statuses, messages, groups, emit } = setup();
    await session.connect(config);
    expect(consumer.subscribe).toHaveBeenCalledWith({ topics: ['t'], fromBeginning: true });
    expect(groups[0]).toMatch(/^routiq-/);
    expect(statuses.map((status) => status.state)).toEqual(['connecting', 'connected']);
    await emit('1');
    expect(messages[0]).toMatchObject({ id: 't-0-1', flowId: 'f1', timestamp: 7 });
    expect(session.isActive).toBe(true);
  });

  it('uses a custom group id', async () => {
    const { session, groups } = setup();
    await session.connect({ ...config, groupId: 'mine' });
    expect(groups[0]).toBe('mine');
  });

  it('reports connection failures and releases the consumer', async () => {
    const { session, statuses, consumer } = setup({ connect: vi.fn(async () => Promise.reject(new Error('connect ECONNREFUSED'))) });
    await session.connect(config);
    expect(statuses.at(-1)).toMatchObject({ state: 'error' });
    expect(statuses.at(-1)?.detail).toContain('Cannot connect');
    expect(consumer.disconnect).toHaveBeenCalled();
    expect(session.isActive).toBe(false);
  });

  it('times out a hanging connect', async () => {
    const { session, statuses } = setup({ connect: () => new Promise(() => undefined) });
    await session.connect(config);
    expect(statuses.at(-1)?.detail).toContain('timeout');
  });

  it('stops delivering after disconnect and announces it', async () => {
    const { session, statuses, messages, emit, consumer } = setup();
    await session.connect(config);
    await session.disconnect();
    await emit('2');
    expect(messages).toHaveLength(0);
    expect(statuses.at(-1)?.state).toBe('disconnected');
    expect(consumer.stop).toHaveBeenCalled();
  });

  it('turns a consumer crash into an error status', async () => {
    const { session, statuses, crash } = setup();
    await session.connect(config);
    crash(new Error('rebalance failed'));
    expect(statuses.at(-1)).toEqual({ state: 'error', detail: 'rebalance failed' });
    expect(session.isActive).toBe(false);
  });

  it('produces and always disconnects the producer', async () => {
    const { session, producer } = setup();
    const record = { topic: 't', key: null, value: 'v', headers: {} };
    expect(await session.produce(config, record, 'r1')).toEqual({ requestId: 'r1', ok: true, topic: 't', partition: 1, offset: '5' });
    producer.send.mockRejectedValueOnce(new Error('nope'));
    expect(await session.produce(config, record, 'r2')).toMatchObject({ ok: false, error: 'nope' });
    expect(producer.disconnect).toHaveBeenCalledTimes(2);
  });
});

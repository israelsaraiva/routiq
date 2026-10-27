import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { ReplayRecord } from '../core/kafka/replayPlan';
import { EMPTY_SEND_DRAFT, buildSendJobRequest } from '../core/kafka/sendJob';
import { createKafkaProfile } from '../core/kafka/profiles';
import { KafkaJobProgress, KafkaReplayRequest, KafkaSendJobRequest } from '../shared/kafkaProduceTypes';
import { KafkaClientFactory, KafkaProducedRecord } from './kafkaClient';
import { KafkaProducerJobs } from './kafkaProducerJobs';

const config: KafkaConnectionConfig = { brokers: ['b:9092'], topics: [], fromBeginning: false, ssl: false };
const profile = createKafkaProfile('Local', () => 'p1');

function setup(send?: (record: KafkaProducedRecord) => Promise<{ partition?: number; offset?: string }>) {
  const sent: KafkaProducedRecord[] = [];
  const producer = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    send: vi.fn(async (record: KafkaProducedRecord) => {
      sent.push(record);
      return send ? send(record) : { partition: sent.length % 2, offset: String(sent.length) };
    }),
  };
  const factory: KafkaClientFactory = () => ({ createConsumer: () => { throw new Error('unused'); }, createOffsetLookup: () => { throw new Error('unused'); }, createProducer: () => producer });
  const progress: KafkaJobProgress[] = [];
  const jobs = new KafkaProducerJobs(factory, { connectionTimeoutMs: 100 });
  return { jobs, producer, sent, progress, onProgress: (entry: KafkaJobProgress) => progress.push(entry) };
}

const sendRequest = (overrides: Partial<KafkaSendJobRequest> = {}): KafkaSendJobRequest => ({
  ...buildSendJobRequest('job', profile, { ...EMPTY_SEND_DRAFT, topic: 'orders', key: 'k-{{$index}}', value: '{"id":"{{$uuid}}","n":{{$index}}}', count: '3' }, { h: '{{$index}}' }),
  ...overrides,
});

describe('KafkaProducerJobs.runSend', () => {
  it('sends N copies, resolving the template per message', async () => {
    const { jobs, sent, producer, onProgress } = setup();
    const result = await jobs.runSend(config, sendRequest(), {}, onProgress);
    expect(result).toMatchObject({ state: 'done', sent: 3, failed: 0, total: 3, partitionCounts: { '0': 1, '1': 2 } });
    expect(sent.map((record) => record.key)).toEqual(['k-1', 'k-2', 'k-3']);
    expect(new Set(sent.map((record) => JSON.parse(record.value as string).id)).size).toBe(3);
    expect(sent.map((record) => record.headers.h)).toEqual(['1', '2', '3']);
    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('passes partition, compression, acks and tombstones to the producer', async () => {
    const { jobs, sent, onProgress } = setup();
    await jobs.runSend(config, sendRequest({ count: 1, partition: 2, compression: 'gzip', acks: 'leader', tombstone: true }), {}, onProgress);
    expect(sent[0]).toMatchObject({ topic: 'orders', partition: 2, compression: 'gzip', acks: 'leader', value: null });
  });

  it('applies collection variables', async () => {
    const { jobs, sent, onProgress } = setup();
    await jobs.runSend(config, sendRequest({ count: 1, value: '{{tenant}}' }), { tenant: 'acme' }, onProgress);
    expect(sent[0].value).toBe('acme');
  });

  it('records failures and aborts after repeated consecutive failures', async () => {
    const { jobs, producer, onProgress } = setup(async () => Promise.reject(new Error('broker down')));
    const result = await jobs.runSend(config, sendRequest({ count: 50 }), {}, onProgress);
    expect(result.state).toBe('failed');
    expect(result.failed).toBe(5);
    expect(result.detail).toContain('consecutive failures');
    expect(result.errors).toEqual(['broker down']);
    expect(producer.disconnect).toHaveBeenCalled();
  });

  it('reports a connection failure', async () => {
    const { jobs, producer, onProgress } = setup();
    producer.connect.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const result = await jobs.runSend(config, sendRequest(), {}, onProgress);
    expect(result.state).toBe('failed');
    expect(result.sent).toBe(0);
    expect(producer.disconnect).toHaveBeenCalled();
  });

  it('stops when requested and reports the partial result', async () => {
    let release: () => void = () => undefined;
    const { jobs, sent, onProgress } = setup(
      () => new Promise((resolve) => (release = () => resolve({ partition: 0, offset: '0' }))),
    );
    const running = jobs.runSend(config, sendRequest({ count: 100 }), {}, onProgress);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    jobs.stop('job');
    release();
    const result = await running;
    expect(result).toMatchObject({ state: 'stopped', sent: 1, total: 100 });
    expect(jobs.runningCount).toBe(0);
  });
});

describe('KafkaProducerJobs repeat', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('repeats runs on the interval up to the cap', async () => {
    const { jobs, sent, onProgress } = setup();
    const running = jobs.runSend(config, sendRequest({ count: 2, repeatIntervalMs: 1000, repeatMaxRuns: 3 }), {}, onProgress);
    await vi.advanceTimersByTimeAsync(2500);
    const result = await running;
    expect(result).toMatchObject({ state: 'done', sent: 6, total: 6, runs: 3 });
    expect(sent.map((record) => record.key)).toEqual(['k-1', 'k-2', 'k-3', 'k-4', 'k-5', 'k-6']);
  });

  it('stopAll ends a repeating job during its wait', async () => {
    const { jobs, onProgress } = setup();
    const running = jobs.runSend(config, sendRequest({ count: 1, repeatIntervalMs: 60000, repeatMaxRuns: 10 }), {}, onProgress);
    await vi.advanceTimersByTimeAsync(10);
    jobs.stopAll();
    expect(await running).toMatchObject({ state: 'stopped', sent: 1 });
  });

  it('paces by rate limit', async () => {
    const { jobs, sent, onProgress } = setup();
    const running = jobs.runSend(config, sendRequest({ count: 3, ratePerSecond: 2 }), {}, onProgress);
    await vi.advanceTimersByTimeAsync(10);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    await running;
    expect(sent).toHaveLength(3);
  });
});

describe('KafkaProducerJobs.runReplay', () => {
  const record = (id: string, extra: Partial<ReplayRecord> = {}): ReplayRecord => ({
    topic: 'target',
    key: `k${id}`,
    value: `v${id}`,
    headers: { h: id },
    compression: 'none',
    acks: 'all',
    sourceId: id,
    ...extra,
  });
  const request: KafkaReplayRequest = {
    jobId: 'replay',
    targetProfile: profile,
    targetTopic: 'target',
    messages: [],
    partitionMode: 'auto',
    explicitPartition: null,
    keepTimestamps: false,
    ratePerSecond: 0,
    compression: 'none',
    acks: 'all',
  };

  it('replays records in order preserving key, headers, value and timestamps', async () => {
    const { jobs, sent, onProgress } = setup();
    const result = await jobs.runReplay(config, request, [record('1', { timestamp: 111 }), record('2', { value: null })], onProgress);
    expect(result).toMatchObject({ kind: 'replay', state: 'done', sent: 2, total: 2 });
    expect(sent).toEqual([
      expect.objectContaining({ topic: 'target', key: 'k1', value: 'v1', headers: { h: '1' }, timestamp: 111 }),
      expect.objectContaining({ key: 'k2', value: null }),
    ]);
    expect(sent[0]).not.toHaveProperty('sourceId');
  });
});

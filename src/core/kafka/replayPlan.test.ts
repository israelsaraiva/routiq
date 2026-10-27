import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { ReplayOptions, planReplay, sortChronologically } from './replayPlan';

const message = (id: string, partition: number, offset: string, timestamp: number, overrides: Partial<KafkaMessage> = {}): KafkaMessage => ({
  id,
  flowId: 'f',
  timestamp,
  topic: 'orders',
  partition,
  offset,
  key: `key-${id}`,
  value: `{"id":"${id}"}`,
  headers: { h: id },
  ...overrides,
});

const baseOptions = (overrides: Partial<ReplayOptions> = {}): ReplayOptions => ({
  messages: [message('b', 0, '2', 200), message('a', 0, '1', 100)],
  sourceProfile: { id: 'src', brokers: 'localhost:9092' },
  targetProfile: { id: 'tgt', name: 'Target', brokers: 'other:9092' },
  targetTopic: 'orders-copy',
  partitionMode: 'auto',
  explicitPartition: null,
  keepTimestamps: false,
  compression: 'none',
  acks: 'all',
  ...overrides,
});

describe('planReplay', () => {
  it('counts replayable messages, preserves key/headers/value and orders chronologically', () => {
    const plan = planReplay(baseOptions());
    expect(plan.count).toBe(2);
    expect(plan.blockedReason).toBeUndefined();
    expect(plan.records.map((record) => record.sourceId)).toEqual(['a', 'b']);
    expect(plan.records[0]).toMatchObject({ topic: 'orders-copy', key: 'key-a', value: '{"id":"a"}', headers: { h: 'a' }, partition: undefined, timestamp: undefined });
  });

  it('skips splunk pseudo records and counts them', () => {
    const plan = planReplay(baseOptions({ messages: [message('a', 0, '1', 1), message('s', 0, '', 1, { topic: 'splunk-json' })] }));
    expect(plan).toMatchObject({ count: 1, skipped: 1 });
  });

  it('keeps timestamps and chooses partitions', () => {
    const kept = planReplay(baseOptions({ keepTimestamps: true, partitionMode: 'original', messages: [message('a', 3, '1', 100, { recordTimestamp: 50 })] }));
    expect(kept.records[0]).toMatchObject({ timestamp: 50, partition: 3 });
    const explicit = planReplay(baseOptions({ partitionMode: 'explicit', explicitPartition: 2 }));
    expect(explicit.records.every((record) => record.partition === 2)).toBe(true);
  });

  it('turns empty values into tombstones', () => {
    expect(planReplay(baseOptions({ messages: [message('a', 0, '1', 1, { value: '' })] })).records[0].value).toBeNull();
  });

  it('keeps an explicit empty string distinct from a tombstone', () => {
    const records = planReplay(
      baseOptions({ messages: [message('a', 0, '1', 1, { value: '', tombstone: false }), message('b', 0, '2', 2, { value: '', tombstone: true })] }),
    ).records;
    expect(records.map((record) => record.value)).toEqual(['', null]);
  });

  it('flags the same topic on the same connection or cluster', () => {
    expect(planReplay(baseOptions({ targetProfile: { id: 'src', name: 'Source', brokers: 'localhost:9092' }, targetTopic: 'orders' }))).toMatchObject({
      sameConnection: true,
      sameTopic: true,
    });
    const sameCluster = planReplay(baseOptions({ targetProfile: { id: 'copy', name: 'Copy', brokers: 'LOCALHOST:9092' }, targetTopic: ' orders ' }));
    expect(sameCluster.sameTopic).toBe(true);
    expect(planReplay(baseOptions({ targetProfile: { id: 'src', name: 'Source', brokers: 'localhost:9092' }, targetTopic: 'elsewhere' })).sameTopic).toBe(false);
    expect(planReplay(baseOptions({ targetTopic: 'orders' })).sameTopic).toBe(false);
  });

  it('blocks read-only targets, missing topics, invalid partitions and empty selections', () => {
    expect(planReplay(baseOptions({ targetProfile: { id: 't', name: 'Prod', brokers: 'x:1', readOnly: true } })).blockedReason).toContain('read-only');
    expect(planReplay(baseOptions({ targetTopic: '  ' })).blockedReason).toBe('Choose a target topic');
    expect(planReplay(baseOptions({ partitionMode: 'explicit' })).blockedReason).toContain('partition');
    expect(planReplay(baseOptions({ messages: [] })).blockedReason).toBe('No replayable messages selected');
  });
});

describe('sortChronologically', () => {
  it('orders by offset within a partition and by time across partitions', () => {
    const sorted = sortChronologically([message('c', 1, '1', 150), message('b', 0, '10', 300), message('a', 0, '9', 100)]);
    expect(sorted.map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
  });
});

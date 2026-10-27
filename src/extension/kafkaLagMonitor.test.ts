import { afterEach, describe, expect, it, vi } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { KafkaAdminLike } from './kafkaAdmin';
import { KafkaLagMonitor } from './kafkaLagMonitor';

const config: KafkaConnectionConfig = { brokers: ['b:9092'], topics: ['orders'], fromBeginning: false, ssl: false, groupId: 'g1' };
const target = { config, groupId: 'g1', topics: ['orders'] };

function fakeAdmin(overrides: Partial<KafkaAdminLike> = {}): KafkaAdminLike {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    fetchGroupOffsets: vi.fn(async () => [{ topic: 'orders', partition: 0, offset: '3' }, { topic: 'orders', partition: 1, offset: '-1' }]),
    fetchTopicOffsets: vi.fn(async () => [{ partition: 0, low: '0', high: '10' }, { partition: 1, low: '2', high: '6' }]),
    ...overrides,
  } as unknown as KafkaAdminLike;
}

function monitorWith(admin: KafkaAdminLike) {
  const lags: Array<number | undefined> = [];
  const createAdmin = vi.fn(() => admin);
  const monitor = new KafkaLagMonitor({ intervalMs: 1000, timeoutMs: 500, createAdmin, onLag: (lag) => lags.push(lag) });
  return { monitor, lags, createAdmin };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('KafkaLagMonitor', () => {
  it('reports total lag now and on every interval, reusing one admin connection', async () => {
    vi.useFakeTimers();
    const admin = fakeAdmin();
    const { monitor, lags, createAdmin } = monitorWith(admin);
    monitor.start(target);
    await vi.advanceTimersByTimeAsync(2000);
    expect(lags).toEqual([11, 11, 11]);
    expect(createAdmin).toHaveBeenCalledTimes(1);
    expect(admin.connect).toHaveBeenCalledTimes(1);
    monitor.stop();
    expect(admin.disconnect).toHaveBeenCalled();
  });

  it('reports unavailable lag and reconnects on the next poll when the admin call fails', async () => {
    vi.useFakeTimers();
    const fetchGroupOffsets = vi.fn().mockRejectedValueOnce(new Error('not authorized')).mockResolvedValue([{ topic: 'orders', partition: 0, offset: '9' }]);
    const admin = fakeAdmin({ fetchGroupOffsets });
    const { monitor, lags, createAdmin } = monitorWith(admin);
    monitor.start(target);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lags).toEqual([undefined, 1]);
    expect(createAdmin).toHaveBeenCalledTimes(2);
    monitor.stop();
  });

  it('stops polling and ignores late results after stop', async () => {
    vi.useFakeTimers();
    const { monitor, lags } = monitorWith(fakeAdmin());
    monitor.start(target);
    monitor.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(lags).toEqual([]);
  });

  it('has nothing to report without topics', async () => {
    vi.useFakeTimers();
    const { monitor, lags } = monitorWith(fakeAdmin());
    monitor.start({ ...target, topics: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(lags).toEqual([undefined]);
    monitor.stop();
  });
});

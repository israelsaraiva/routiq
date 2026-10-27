import { describe, expect, it, vi } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { KafkaAdminLike, KafkaAdminService } from './kafkaAdmin';

const config: KafkaConnectionConfig = { brokers: ['localhost:9092'], topics: [], fromBeginning: false, ssl: false };

function createFakeAdmin(overrides: Partial<KafkaAdminLike> = {}): KafkaAdminLike & { calls: string[] } {
  const calls: string[] = [];
  const track = <Args extends unknown[], Result>(name: string, result: (...args: Args) => Promise<Result>) => {
    return (...args: Args) => {
      calls.push(name);
      return result(...args);
    };
  };
  const admin: KafkaAdminLike = {
    connect: track('connect', async () => undefined),
    disconnect: track('disconnect', async () => undefined),
    listTopics: track('listTopics', async () => ['orders', '__consumer_offsets']),
    describeTopics: track('describeTopics', async (topics: string[]) =>
      topics.map((name) => ({ name, partitions: [{ partition: 0, leader: 1, replicas: [1], isr: [1] }] })),
    ),
    fetchTopicOffsets: track('fetchTopicOffsets', async () => [{ partition: 0, low: '0', high: '10' }]),
    fetchOffsetsByTimestamp: track('fetchOffsetsByTimestamp', async () => [{ partition: 0, offset: '4' }]),
    describeTopicConfigs: track('describeTopicConfigs', async () => [{ name: 'retention.ms', value: '1', isDefault: false, readOnly: false, sensitive: false }]),
    alterTopicConfigs: track('alterTopicConfigs', async () => undefined),
    createPartitions: track('createPartitions', async () => undefined),
    describeBrokerConfigs: track('describeBrokerConfigs', async () => [{ name: 'inter.broker.protocol.version', value: '3.7-IV4' }]),
    createTopic: track('createTopic', async () => true),
    deleteTopic: track('deleteTopic', async () => undefined),
    listGroups: track('listGroups', async () => [{ groupId: 'g1', protocolType: 'consumer' }]),
    describeGroups: track('describeGroups', async (ids: string[]) =>
      ids.map((groupId) => ({ groupId, state: 'Empty', protocol: '', protocolType: 'consumer', members: [] })),
    ),
    deleteGroup: track('deleteGroup', async () => undefined),
    fetchGroupOffsets: track('fetchGroupOffsets', async (_group: string, topics: string[]) =>
      topics.map((topic) => ({ topic, partition: 0, offset: topic === 'orders' ? '3' : '-1' })),
    ),
    setGroupOffsets: track('setGroupOffsets', async () => undefined),
    describeCluster: track('describeCluster', async () => ({ clusterId: 'abc', controllerId: 2, brokers: [{ nodeId: 2, host: 'b2', port: 9092 }, { nodeId: 1, host: 'b1', port: 9092 }] })),
    ...overrides,
  };
  return Object.assign(admin, { calls });
}

function serviceWith(admin: KafkaAdminLike, timeoutMs = 1000) {
  return new KafkaAdminService(() => admin, { timeoutMs });
}

describe('KafkaAdminService', () => {
  it('lists topics with offsets and always disconnects', async () => {
    const admin = createFakeAdmin();
    const result = await serviceWith(admin).handle(config, 'r1', { kind: 'listTopics' });
    expect(result.data).toMatchObject({ kind: 'topics', topics: [{ name: '__consumer_offsets', internal: true }, { name: 'orders', messageCount: 10, replicationFactor: 1 }] });
    expect(admin.calls.at(-1)).toBe('disconnect');
  });

  it('describes a group with committed offsets and lag, ignoring uncommitted topics', async () => {
    const result = await serviceWith(createFakeAdmin()).handle(config, 'r', { kind: 'describeGroup', groupId: 'g1' });
    expect(result.data).toMatchObject({
      kind: 'group',
      group: { groupId: 'g1', totalLag: 7, offsets: [{ topic: 'orders', partition: 0, committed: '3', logEnd: '10', lag: 7 }] },
    });
  });

  it('refuses to delete or reset a group with active members', async () => {
    const stable = createFakeAdmin({ describeGroups: async () => [{ groupId: 'g1', state: 'Stable', protocol: 'range', protocolType: 'consumer', members: [] }] });
    const service = serviceWith(stable);
    expect((await service.handle(config, 'r', { kind: 'deleteGroup', groupId: 'g1' })).error).toContain('must be empty');
    expect((await service.handle(config, 'r', { kind: 'resetGroupOffsets', groupId: 'g1', target: { kind: 'earliest' } })).error).toContain('must be empty');
    expect(stable.calls).not.toContain('deleteGroup');
    expect(stable.calls).not.toContain('setGroupOffsets');
  });

  it('resets offsets of an empty group to the requested position', async () => {
    const setGroupOffsets = vi.fn(async () => undefined);
    const admin = createFakeAdmin({ setGroupOffsets });
    const service = serviceWith(admin);
    await service.handle(config, 'r', { kind: 'resetGroupOffsets', groupId: 'g1', target: { kind: 'latest' } });
    await service.handle(config, 'r', { kind: 'resetGroupOffsets', groupId: 'g1', target: { kind: 'timestamp', timestamp: 5 } });
    expect(setGroupOffsets).toHaveBeenNthCalledWith(1, 'g1', 'orders', [{ partition: 0, offset: '10' }]);
    expect(setGroupOffsets).toHaveBeenNthCalledWith(2, 'g1', 'orders', [{ partition: 0, offset: '4' }]);
  });

  it('creates, deletes and reports topics', async () => {
    const service = serviceWith(createFakeAdmin());
    const created = await service.handle(config, 'r', { kind: 'createTopic', topic: { name: 't', partitions: 1, replicationFactor: 1, configs: {} } });
    expect(created.data).toEqual({ kind: 'done', message: 'Created topic "t"' });
    const deleted = await service.handle(config, 'r', { kind: 'deleteTopic', topic: 't' });
    expect(deleted.data).toEqual({ kind: 'done', message: 'Deleted topic "t"' });
  });

  it('orders brokers and marks the controller', async () => {
    const result = await serviceWith(createFakeAdmin()).handle(config, 'r', { kind: 'describeCluster' });
    expect(result.data).toMatchObject({
      cluster: { clusterId: 'abc', brokers: [{ nodeId: 1, isController: false }, { nodeId: 2, isController: true }] },
    });
  });

  it('derives a version hint from the controller broker configs', async () => {
    const describeBrokerConfigs = vi.fn(async () => [{ name: 'inter.broker.protocol.version', value: '3.7-IV4' }]);
    const result = await serviceWith(createFakeAdmin({ describeBrokerConfigs })).handle(config, 'r', { kind: 'describeCluster' });
    expect(describeBrokerConfigs).toHaveBeenCalledWith(2);
    expect(result.data).toMatchObject({ cluster: { version: 'inter.broker.protocol.version: 3.7-IV4' } });
  });

  it('keeps the cluster usable when broker configs cannot be read', async () => {
    const admin = createFakeAdmin({ describeBrokerConfigs: async () => Promise.reject(new Error('denied')) });
    const result = await serviceWith(admin).handle(config, 'r', { kind: 'describeCluster' });
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({ cluster: { clusterId: 'abc' } });
  });

  it('alters topic configs preserving existing overrides and supports validate only', async () => {
    const alterTopicConfigs = vi.fn(async () => undefined);
    const admin = createFakeAdmin({ alterTopicConfigs });
    const service = serviceWith(admin);
    const applied = await service.handle(config, 'r', { kind: 'alterTopicConfigs', topic: 'orders', changes: { 'cleanup.policy': 'compact' }, validateOnly: false });
    expect(applied.data).toMatchObject({ kind: 'done', message: 'Updated 1 config(s) of "orders"' });
    expect(alterTopicConfigs).toHaveBeenLastCalledWith('orders', [{ name: 'retention.ms', value: '1' }, { name: 'cleanup.policy', value: 'compact' }], false);
    const validated = await service.handle(config, 'r', { kind: 'alterTopicConfigs', topic: 'orders', changes: { 'retention.ms': '5' }, validateOnly: true });
    expect(validated.data).toMatchObject({ message: expect.stringContaining('nothing was applied') });
    expect(alterTopicConfigs).toHaveBeenLastCalledWith('orders', [{ name: 'retention.ms', value: '5' }], true);
  });

  it('does not alter read-only configs', async () => {
    const readOnly = { name: 'x', value: '1', isDefault: false, readOnly: true, sensitive: false };
    const admin = createFakeAdmin({ describeTopicConfigs: async () => [readOnly] });
    const result = await serviceWith(admin).handle(config, 'r', { kind: 'alterTopicConfigs', topic: 'orders', changes: { x: '2' }, validateOnly: false });
    expect(result.error).toMatch(/read-only/);
    expect(admin.calls).not.toContain('alterTopicConfigs');
  });

  it('increases partitions only upwards', async () => {
    const createPartitions = vi.fn(async () => undefined);
    const service = serviceWith(createFakeAdmin({ createPartitions }));
    const grown = await service.handle(config, 'r', { kind: 'increasePartitions', topic: 'orders', totalPartitions: 4 });
    expect(grown.data).toEqual({ kind: 'done', message: 'Increased "orders" to 4 partitions' });
    expect(createPartitions).toHaveBeenCalledWith('orders', 4);
    const same = await service.handle(config, 'r', { kind: 'increasePartitions', topic: 'orders', totalPartitions: 1 });
    expect(same.error).toMatch(/greater than 1/);
    expect(createPartitions).toHaveBeenCalledTimes(1);
  });

  it('turns authorization failures into friendly errors', async () => {
    const admin = createFakeAdmin({ listGroups: async () => Promise.reject(Object.assign(new Error('denied'), { type: 'GROUP_AUTHORIZATION_FAILED' })) });
    const result = await serviceWith(admin).handle(config, 'r', { kind: 'listGroups' });
    expect(result.error).toContain('Not authorized');
    expect(admin.calls.at(-1)).toBe('disconnect');
  });

  it('times out slow brokers', async () => {
    const admin = createFakeAdmin({ connect: () => new Promise(() => undefined) });
    const result = await serviceWith(admin, 20).handle(config, 'r', { kind: 'describeCluster' });
    expect(result.error).toContain('timeout');
  });
});

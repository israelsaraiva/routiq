import { Kafka, logLevel } from 'kafkajs';
import { afterAll, describe, expect, it } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { KafkaAdminCommand, KafkaAdminData } from '../shared/kafkaAdminTypes';
import { KafkaAdminService, createKafkaAdmin } from './kafkaAdmin';

const broker = process.env.ROUTIQ_KAFKA_E2E_BROKER;
const TIMEOUT_MS = 8000;
const MESSAGE_COUNT = 5;
const CONSUMED_BEFORE_STOP = 3;
const WAIT_TIMEOUT_MS = 20000;
const TEST_TIMEOUT_MS = 60000;

const config: KafkaConnectionConfig = { brokers: [broker ?? ''], topics: [], fromBeginning: false, ssl: false };
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const topic = `routiq-admin-e2e-${suffix}`;
const groupId = `routiq-admin-e2e-group-${suffix}`;
const service = new KafkaAdminService(createKafkaAdmin, { timeoutMs: TIMEOUT_MS });
const kafka = new Kafka({ brokers: [broker ?? ''], clientId: 'routiq-admin-e2e', logLevel: logLevel.NOTHING });

async function run<Kind extends KafkaAdminData['kind']>(command: KafkaAdminCommand, kind: Kind): Promise<Extract<KafkaAdminData, { kind: Kind }>> {
  const result = await service.handle(config, 'e2e', command);
  expect(result.error).toBeUndefined();
  expect(result.data?.kind).toBe(kind);
  return result.data as Extract<KafkaAdminData, { kind: Kind }>;
}

async function waitFor(condition: () => Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function produceMessages(): Promise<void> {
  const producer = kafka.producer();
  await producer.connect();
  await producer.send({ topic, messages: Array.from({ length: MESSAGE_COUNT }, (_, index) => ({ key: `k${index}`, value: `v${index}` })) });
  await producer.disconnect();
}

async function consumeSomeMessagesThenLeave(): Promise<void> {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  let consumed = 0;
  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic: messageTopic, partition, message }) => {
      consumed++;
      consumed <= CONSUMED_BEFORE_STOP && (await consumer.commitOffsets([{ topic: messageTopic, partition, offset: (Number(message.offset) + 1).toString() }]));
    },
  });
  await waitFor(async () => consumed >= MESSAGE_COUNT, 'consumer to read all messages');
  await consumer.stop();
  await consumer.disconnect();
}

async function groupIsEmpty(): Promise<boolean> {
  const { group } = await run({ kind: 'describeGroup', groupId }, 'group');
  return group.state === 'Empty';
}

afterAll(async () => {
  await service.handle(config, 'cleanup', { kind: 'deleteTopic', topic });
  await service.handle(config, 'cleanup', { kind: 'deleteGroup', groupId });
});

describe.skipIf(!broker)('KafkaAdminService against a real broker', () => {
  it('describes the cluster', async () => {
    const { cluster } = await run({ kind: 'describeCluster' }, 'cluster');
    expect(cluster.brokers).toHaveLength(1);
    expect(cluster.brokers[0]).toMatchObject({ nodeId: 1, isController: true });
    expect(cluster.clusterId).toBeTruthy();
  });

  it('creates a topic and lists it with partitions, offsets and configs', async () => {
    const creation = { name: topic, partitions: 2, replicationFactor: 1, configs: { 'retention.ms': '86400000' } };
    await run({ kind: 'createTopic', topic: creation }, 'done');
    await produceMessages();
    const { topics } = await run({ kind: 'listTopics' }, 'topics');
    const listed = topics.find((candidate) => candidate.name === topic);
    expect(listed).toMatchObject({ internal: false, replicationFactor: 1, messageCount: MESSAGE_COUNT });
    expect(listed?.partitions).toHaveLength(2);
    expect(listed?.partitions[0]).toMatchObject({ leader: 1, replicas: [1], isr: [1] });
    const { configs } = await run({ kind: 'describeTopicConfigs', topic }, 'topicConfigs');
    expect(configs.find((entry) => entry.name === 'retention.ms')).toMatchObject({ value: '86400000', isDefault: false });
  });

  it('shows group detail with lag, resets offsets and deletes the group', async () => {
    await consumeSomeMessagesThenLeave();
    await waitFor(groupIsEmpty, 'group to become empty');

    const { topics } = await run({ kind: 'listTopics' }, 'topics');
    expect(topics.find((candidate) => candidate.name === '__consumer_offsets')?.internal).toBe(true);

    const { groups } = await run({ kind: 'listGroups' }, 'groups');
    expect(groups.find((group) => group.groupId === groupId)).toMatchObject({ state: 'Empty', memberCount: 0 });

    const { group } = await run({ kind: 'describeGroup', groupId }, 'group');
    expect(group.offsets.length).toBeGreaterThan(0);
    expect(group.totalLag).toBe(group.offsets.reduce((total, offset) => total + offset.lag, 0));
    expect(group.totalLag).toBeLessThanOrEqual(MESSAGE_COUNT);
    expect(group.totalLag).toBeGreaterThan(0);

    await run({ kind: 'resetGroupOffsets', groupId, target: { kind: 'latest' } }, 'done');
    expect((await run({ kind: 'describeGroup', groupId }, 'group')).group.totalLag).toBe(0);

    await run({ kind: 'resetGroupOffsets', groupId, target: { kind: 'earliest' } }, 'done');
    expect((await run({ kind: 'describeGroup', groupId }, 'group')).group.totalLag).toBe(MESSAGE_COUNT);

    await run({ kind: 'resetGroupOffsets', groupId, target: { kind: 'timestamp', timestamp: Date.now() + 60000 } }, 'done');
    expect((await run({ kind: 'describeGroup', groupId }, 'group')).group.totalLag).toBe(0);

    await run({ kind: 'deleteGroup', groupId }, 'done');
    const after = await run({ kind: 'listGroups' }, 'groups');
    expect(after.groups.some((candidate) => candidate.groupId === groupId)).toBe(false);
  }, TEST_TIMEOUT_MS);

  it('deletes the topic', async () => {
    await run({ kind: 'deleteTopic', topic }, 'done');
    await waitFor(async () => !(await run({ kind: 'listTopics' }, 'topics')).topics.some((candidate) => candidate.name === topic), 'topic to disappear');
  });
});

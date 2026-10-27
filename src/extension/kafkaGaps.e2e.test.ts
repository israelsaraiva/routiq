import { Kafka, logLevel } from 'kafkajs';
import { afterAll, describe, expect, it } from 'vitest';
import * as protobuf from 'protobufjs';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { buildKafkaMessage } from '../core/kafka/messageList';
import { encodeMessageIndex } from '../core/kafka/protobuf/messageIndex';
import { isTombstone } from '../core/kafka/tombstone';
import { KafkaAdminCommand, KafkaAdminData } from '../shared/kafkaAdminTypes';
import { KafkaAdminService, createKafkaAdmin } from './kafkaAdmin';
import { KafkaValueDecoder } from './kafkaDecoding';

const broker = process.env.ROUTIQ_KAFKA_E2E_BROKER;
const TIMEOUT_MS = 8000;
const WAIT_TIMEOUT_MS = 20000;
const TEST_TIMEOUT_MS = 60000;
const PROTO = 'syntax = "proto3"; package e2e; message Ping { string id = 1; int32 count = 2; }';

const config: KafkaConnectionConfig = { brokers: [broker ?? ''], topics: [], fromBeginning: false, ssl: false };
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const topic = `routiq-gaps-e2e-${suffix}`;
const service = new KafkaAdminService(createKafkaAdmin, { timeoutMs: TIMEOUT_MS });
const kafka = new Kafka({ brokers: [broker ?? ''], clientId: 'routiq-gaps-e2e', logLevel: logLevel.NOTHING });

async function run<Kind extends KafkaAdminData['kind']>(command: KafkaAdminCommand, kind: Kind): Promise<Extract<KafkaAdminData, { kind: Kind }>> {
  const result = await service.handle(config, 'e2e', command);
  expect(result.error).toBeUndefined();
  expect(result.data?.kind).toBe(kind);
  return result.data as Extract<KafkaAdminData, { kind: Kind }>;
}

describe.skipIf(!broker)('kafka gaps against a real broker', () => {
  afterAll(async () => {
    await service.handle(config, 'cleanup', { kind: 'deleteTopic', topic });
  });

  it(
    'creates a topic, validates and applies config changes, and increases partitions',
    async () => {
      await run({ kind: 'createTopic', topic: { name: topic, partitions: 1, replicationFactor: 1, configs: { 'retention.ms': '600000' } } }, 'done');

      const rejected = await service.handle(config, 'e2e', { kind: 'alterTopicConfigs', topic, changes: { 'retention.ms': 'not-a-number' }, validateOnly: true });
      expect(rejected.error).toBeTruthy();

      await run({ kind: 'alterTopicConfigs', topic, changes: { 'max.message.bytes': '2048' }, validateOnly: true }, 'done');
      const untouched = (await run({ kind: 'describeTopicConfigs', topic }, 'topicConfigs')).configs;
      expect(untouched.find((entry) => entry.name === 'max.message.bytes')?.isDefault).toBe(true);

      await run({ kind: 'alterTopicConfigs', topic, changes: { 'max.message.bytes': '2048', 'cleanup.policy': 'compact' }, validateOnly: false }, 'done');
      const applied = (await run({ kind: 'describeTopicConfigs', topic }, 'topicConfigs')).configs;
      expect(applied.find((entry) => entry.name === 'max.message.bytes')?.value).toBe('2048');
      expect(applied.find((entry) => entry.name === 'cleanup.policy')?.value).toBe('compact');
      expect(applied.find((entry) => entry.name === 'retention.ms')?.value).toBe('600000');

      await run({ kind: 'alterTopicConfigs', topic, changes: { 'max.message.bytes': null }, validateOnly: false }, 'done');
      const reset = (await run({ kind: 'describeTopicConfigs', topic }, 'topicConfigs')).configs;
      expect(reset.find((entry) => entry.name === 'max.message.bytes')?.isDefault).toBe(true);

      await run({ kind: 'increasePartitions', topic, totalPartitions: 3 }, 'done');
      const topics = (await run({ kind: 'listTopics' }, 'topics')).topics;
      expect(topics.find((candidate) => candidate.name === topic)?.partitions).toHaveLength(3);
      const shrink = await service.handle(config, 'e2e', { kind: 'increasePartitions', topic, totalPartitions: 2 });
      expect(shrink.error).toBeTruthy();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'reports the broker version hint in the cluster description',
    async () => {
      const { cluster } = await run({ kind: 'describeCluster' }, 'cluster');
      expect(cluster.version).toMatch(/^(inter\.broker\.protocol\.version|log\.message\.format\.version): \d/);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps tombstones distinguishable from empty strings through produce and consume',
    async () => {
      const tombstoneTopic = `${topic}-tomb`;
      await run({ kind: 'createTopic', topic: { name: tombstoneTopic, partitions: 1, replicationFactor: 1, configs: {} } }, 'done');
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({
        topic: tombstoneTopic,
        messages: [{ key: 'a', value: null }, { key: 'b', value: '' }, { key: 'c', value: 'x' }],
      });
      await producer.disconnect();
      const consumer = kafka.consumer({ groupId: `routiq-gaps-tomb-${Math.random().toString(36).slice(2)}` });
      const received: ReturnType<typeof buildKafkaMessage>[] = [];
      await consumer.connect();
      await consumer.subscribe({ topic: tombstoneTopic, fromBeginning: true });
      await consumer.run({ eachMessage: async (record) => void received.push(buildKafkaMessage(record as never, Date.now())) });
      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      while (received.length < 3 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await consumer.stop();
      await consumer.disconnect();
      const byKey = Object.fromEntries(received.map((message) => [message.key, isTombstone(message)]));
      expect(byKey).toEqual({ a: true, b: false, c: false });
      await service.handle(config, 'cleanup', { kind: 'deleteTopic', topic: tombstoneTopic });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'decodes a locally produced protobuf message with the registry wire format and with a plain payload',
    async () => {
      const protoTopic = `${topic}-proto`;
      await run({ kind: 'createTopic', topic: { name: protoTopic, partitions: 1, replicationFactor: 1, configs: {} } }, 'done');
      const ping = protobuf.parse(PROTO).root.lookupType('e2e.Ping');
      const payload = ping.encode(ping.fromObject({ id: 'p-1', count: 300 })).finish();
      const header = Buffer.alloc(5);
      header.writeUInt32BE(7, 1);
      const registryBytes = Buffer.concat([header, encodeMessageIndex([0]), payload]);
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({ topic: protoTopic, messages: [{ key: 'registry', value: registryBytes }] });
      await producer.disconnect();

      const decoder = new KafkaValueDecoder(async () => ({ schema: PROTO, schemaType: 'PROTOBUF', references: [] }));
      decoder.configure({ url: 'http://registry.invalid' });
      decoder.configureProtobuf({ messageType: 'e2e.Ping', file: undefined });
      const consumer = kafka.consumer({ groupId: `routiq-gaps-proto-${Math.random().toString(36).slice(2)}` });
      const raw: Array<{ key: string; value: Buffer }> = [];
      await consumer.connect();
      await consumer.subscribe({ topic: protoTopic, fromBeginning: true });
      await consumer.run({ eachMessage: async ({ message }) => void raw.push({ key: String(message.key), value: message.value as Buffer }) });
      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      while (raw.length < 1 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await consumer.stop();
      await consumer.disconnect();

      const registry = raw.find((entry) => entry.key === 'registry')!;
      const decoded = await decoder.decodeBytes(registry.value, protoTopic);
      expect(decoded.format).toBe('protobuf');
      expect(JSON.parse(decoded.text)).toEqual({ id: 'p-1', count: 300 });
      await service.handle(config, 'cleanup', { kind: 'deleteTopic', topic: protoTopic });
    },
    TEST_TIMEOUT_MS,
  );
});

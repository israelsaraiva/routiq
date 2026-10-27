import { Kafka, logLevel } from 'kafkajs';
import { afterEach, describe, expect, it } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { groupByFlow } from '../core/kafka/flowGroups';
import { KafkaMessage, KafkaStatus } from '../shared/types';
import { createKafkaClient } from './kafkaClient';
import { KafkaSession } from './kafkaSession';

const broker = process.env.ROUTIQ_KAFKA_E2E_BROKER;
const CONNECTION_TIMEOUT_MS = 3000;
const WAIT_TIMEOUT_MS = 20000;

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function configFor(topic: string, overrides: Partial<KafkaConnectionConfig> = {}): KafkaConnectionConfig {
  return { brokers: [broker ?? ''], topics: [topic], fromBeginning: true, ssl: false, ...overrides };
}

async function waitFor(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function createSession() {
  const messages: KafkaMessage[] = [];
  const statuses: KafkaStatus[] = [];
  const session = new KafkaSession(createKafkaClient, { onMessage: (message) => messages.push(message), onStatus: (status) => statuses.push(status) }, { connectionTimeoutMs: CONNECTION_TIMEOUT_MS });
  return { session, messages, statuses };
}

async function groupMemberCount(groupId: string): Promise<number> {
  const admin = new Kafka({ brokers: [broker ?? ''], logLevel: logLevel.NOTHING }).admin();
  await admin.connect();
  try {
    const [description] = (await admin.describeGroups([groupId])).groups;
    return description.members.length;
  } finally {
    await admin.disconnect();
  }
}

async function waitForMember(groupId: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while ((await groupMemberCount(groupId)) === 0) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the consumer to join the group');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

describe.skipIf(!broker)('KafkaSession against a real broker', () => {
  const sessions: KafkaSession[] = [];

  function track(created: ReturnType<typeof createSession>) {
    sessions.push(created.session);
    return created;
  }

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.disconnect(false)));
  });

  async function produce(session: KafkaSession, topic: string, flowId: string, index: number) {
    const record = { topic, key: `key-${index}`, value: JSON.stringify({ index, flowId }), headers: { flowId } };
    const result = await session.produce(configFor(topic), record, `request-${index}`);
    expect(result).toMatchObject({ ok: true, topic });
    return result;
  }

  it('delivers produced records with partition, offset, key, headers and flow id', async () => {
    const topic = uniqueName('routiq-e2e-roundtrip');
    const { session, messages, statuses } = track(createSession());
    await produce(session, topic, 'flow-a', 0);
    await produce(session, topic, 'flow-a', 1);
    await produce(session, topic, 'flow-b', 2);
    const before = Date.now();
    await session.connect(configFor(topic));
    await waitFor(() => messages.length === 3, 'three messages');

    expect(statuses.map((status) => status.state)).toEqual(['connecting', 'connected']);
    expect(statuses[1].detail).toBe('from beginning');
    expect(messages.map((message) => message.offset)).toEqual(['0', '1', '2']);
    expect(messages[0]).toMatchObject({ id: `${topic}-0-0`, topic, partition: 0, key: 'key-0', flowId: 'flow-a', flowIdSource: 'header', headers: { flowId: 'flow-a' } });
    expect(JSON.parse(messages[2].value)).toEqual({ index: 2, flowId: 'flow-b' });
    expect(messages[0].timestamp).toBeGreaterThanOrEqual(before);
    const groups = groupByFlow(messages);
    expect(groups.map((group) => [group.flowId, group.messages.length]).sort()).toEqual([['flow-a', 2], ['flow-b', 1]]);
  });

  it('only delivers new records when not consuming from the beginning', async () => {
    const topic = uniqueName('routiq-e2e-tail');
    const { session, messages } = track(createSession());
    await produce(session, topic, 'old', 0);
    const groupId = uniqueName('routiq-e2e-tail-group');
    await session.connect(configFor(topic, { fromBeginning: false, groupId }));
    await waitForMember(groupId);
    await produce(session, topic, 'new', 1);
    await waitFor(() => messages.length >= 1, 'the new message');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(messages.map((message) => message.flowId)).toEqual(['new']);
  });

  it('honours a custom consumer group id and leaves no members after disconnect', async () => {
    const topic = uniqueName('routiq-e2e-group');
    const groupId = uniqueName('routiq-e2e-group-id');
    const { session, messages } = track(createSession());
    await produce(session, topic, 'flow-a', 0);
    await session.connect(configFor(topic, { groupId }));
    await waitFor(() => messages.length === 1, 'the message');
    expect(await groupMemberCount(groupId)).toBe(1);
    await session.disconnect();
    expect(session.isActive).toBe(false);
    expect(await groupMemberCount(groupId)).toBe(0);
  });

  it('reconnects and replays from the beginning with a fresh group', async () => {
    const topic = uniqueName('routiq-e2e-reconnect');
    const { session, messages, statuses } = track(createSession());
    await produce(session, topic, 'flow-a', 0);
    await session.connect(configFor(topic));
    await waitFor(() => messages.length === 1, 'first delivery');
    await session.connect(configFor(topic));
    await waitFor(() => messages.length === 2, 'second delivery');
    expect(statuses.filter((status) => status.state === 'connected')).toHaveLength(2);
    expect(session.isActive).toBe(true);
  });

  it('reports a friendly error within the timeout when the port is closed', async () => {
    const { session, statuses } = track(createSession());
    const startedAt = Date.now();
    await session.connect({ ...configFor('whatever'), brokers: ['localhost:1'] });
    expect(Date.now() - startedAt).toBeLessThan(CONNECTION_TIMEOUT_MS * 2);
    expect(statuses.at(-1)).toMatchObject({ state: 'error' });
    expect(statuses.at(-1)?.detail).toMatch(/Cannot connect to Kafka broker|Connection timeout/);
    expect(session.isActive).toBe(false);
  });

  it('reports a produce failure with a friendly error when the port is closed', async () => {
    const { session } = track(createSession());
    const result = await session.produce({ ...configFor('whatever'), brokers: ['localhost:1'] }, { topic: 'whatever', key: null, value: 'x', headers: {} }, 'r');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Cannot connect to Kafka broker|Connection timeout/);
  });

  it('connects to a topic that does not exist yet and receives later messages', async () => {
    const topic = uniqueName('routiq-e2e-missing');
    const { session, messages, statuses } = track(createSession());
    await session.connect(configFor(topic));
    expect(statuses.at(-1)?.state).toBe('connected');
    await produce(session, topic, 'late', 0);
    await waitFor(() => messages.length === 1, 'the late message');
    expect(messages[0].flowId).toBe('late');
  });
});

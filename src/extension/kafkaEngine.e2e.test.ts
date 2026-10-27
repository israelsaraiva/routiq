import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { KafkaMessage, KafkaStatus } from '../shared/types';
import { createKafkaClient } from './kafkaClient';
import { KafkaSession } from './kafkaSession';

const broker = process.env.ROUTIQ_KAFKA_E2E_BROKER;
const saslBroker = process.env.ROUTIQ_KAFKA_E2E_SASL_BROKER;
const tlsBroker = process.env.ROUTIQ_KAFKA_E2E_TLS_BROKER;
const mtlsBroker = process.env.ROUTIQ_KAFKA_E2E_MTLS_BROKER;
const certsDirectory = process.env.ROUTIQ_KAFKA_E2E_CERTS ?? '';
const codecTopicsSeeded = process.env.ROUTIQ_KAFKA_E2E_CODEC_TOPICS === '1';
const waitForRestart = process.env.ROUTIQ_KAFKA_E2E_RESTART === '1';
const CONNECTION_TIMEOUT_MS = 5000;
const WAIT_TIMEOUT_MS = 20000;
const RESTART_TIMEOUT_MS = 180000;

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function configFor(topic: string, overrides: Partial<KafkaConnectionConfig> = {}): KafkaConnectionConfig {
  return { brokers: [broker ?? ''], topics: [topic], fromBeginning: false, ssl: false, ...overrides };
}

async function waitFor(condition: () => boolean, description: string, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
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

describe.skipIf(!broker)('Kafka engine start positions against a real broker', () => {
  const sessions: KafkaSession[] = [];

  function track(created: ReturnType<typeof createSession>) {
    sessions.push(created.session);
    return created;
  }

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.disconnect(false)));
  });

  async function seedTopic(topic: string, count: number, timestampOf: (index: number) => number = () => Date.now()) {
    const { Kafka, logLevel } = await import('kafkajs');
    const producer = new Kafka({ brokers: [broker ?? ''], logLevel: logLevel.NOTHING }).producer();
    await producer.connect();
    await producer.send({ topic, messages: Array.from({ length: count }, (_, index) => ({ value: JSON.stringify({ index }), timestamp: String(timestampOf(index)) })) });
    await producer.disconnect();
  }

  const indexes = (messages: KafkaMessage[]) => messages.map((message) => JSON.parse(message.value).index);

  it('uses the record timestamp rather than the arrival time', async () => {
    const topic = uniqueName('routiq-engine-timestamp');
    const recordTime = Date.now() - 3_600_000;
    await seedTopic(topic, 1, () => recordTime);
    const { session, messages } = track(createSession());
    await session.connect(configFor(topic, { fromBeginning: true, startPosition: { kind: 'beginning' } }));
    await waitFor(() => messages.length === 1, 'the message');
    expect(messages[0].timestamp).toBe(recordTime);
    expect(messages[0].receivedAt).toBeGreaterThan(recordTime);
  });

  it('starts from a specific offset', async () => {
    const topic = uniqueName('routiq-engine-offset');
    await seedTopic(topic, 10);
    const { session, messages } = track(createSession());
    await session.connect(configFor(topic, { startPosition: { kind: 'offsets', entries: [{ offset: '7' }] } }));
    await waitFor(() => messages.length === 3, 'offsets 7..9');
    expect(indexes(messages)).toEqual([7, 8, 9]);
  });

  it('starts from the last N messages per partition', async () => {
    const topic = uniqueName('routiq-engine-lastn');
    await seedTopic(topic, 10);
    const { session, messages } = track(createSession());
    await session.connect(configFor(topic, { startPosition: { kind: 'lastN', count: 4 } }));
    await waitFor(() => messages.length === 4, 'the last four');
    expect(indexes(messages)).toEqual([6, 7, 8, 9]);
  });

  it('starts from a timestamp', async () => {
    const topic = uniqueName('routiq-engine-time');
    const base = Date.now() - 10_000_000;
    await seedTopic(topic, 6, (index) => base + index * 1000);
    const { session, messages } = track(createSession());
    await session.connect(configFor(topic, { startPosition: { kind: 'timestamp', timestamp: base + 3000 } }));
    await waitFor(() => messages.length === 3, 'records at or after the timestamp');
    expect(indexes(messages)).toEqual([3, 4, 5]);
  });

  it.skipIf(!codecTopicsSeeded).each(['snappy', 'lz4', 'zstd', 'gzip'])('decodes %s compressed records seeded by the Kafka CLI', async (codec) => {
    const { session, messages } = track(createSession());
    await session.connect(configFor(`codec-${codec}`, { fromBeginning: true, startPosition: { kind: 'beginning' } }));
    await waitFor(() => messages.length >= 1, `a ${codec} message`);
    expect(JSON.parse(messages[0].value)).toEqual({ codec });
  });

  it.skipIf(!waitForRestart)(
    'reconnects after the broker restarts and resumes without replaying',
    async () => {
      const topic = uniqueName('routiq-engine-restart');
      await seedTopic(topic, 3);
      const { session, messages, statuses } = track(createSession());
      await session.connect(configFor(topic, { fromBeginning: true, startPosition: { kind: 'beginning' } }));
      await waitFor(() => messages.length === 3, 'initial messages');
      process.stdout.write('\nROUTIQ_E2E: restart the broker now\n');
      await waitFor(() => statuses.some((status) => status.state === 'reconnecting'), 'the reconnecting state', RESTART_TIMEOUT_MS);
      await waitFor(() => statuses.at(-1)?.state === 'connected', 'the reconnected state', RESTART_TIMEOUT_MS);
      await seedTopic(topic, 2);
      await waitFor(() => messages.length === 5, 'messages after the restart', RESTART_TIMEOUT_MS);
      expect(indexes(messages)).toEqual([0, 1, 2, 0, 1]);
    },
    RESTART_TIMEOUT_MS * 3,
  );
});

describe.skipIf(!saslBroker)('Kafka SASL authentication against a real broker', () => {
  const sessions: KafkaSession[] = [];

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.disconnect(false)));
  });

  async function connectWith(mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512', password: string) {
    const created = createSession();
    sessions.push(created.session);
    await created.session.connect({
      brokers: [saslBroker ?? ''],
      topics: [uniqueName('routiq-engine-sasl')],
      fromBeginning: false,
      ssl: false,
      sasl: { mechanism, username: 'alice', password },
    });
    return created;
  }

  it.each(['plain', 'scram-sha-256', 'scram-sha-512'] as const)('connects with %s and valid credentials', async (mechanism) => {
    const { statuses } = await connectWith(mechanism, 'alice-secret');
    expect(statuses.at(-1)?.state).toBe('connected');
  });

  it.each(['plain', 'scram-sha-256'] as const)('reports a friendly error for bad %s credentials', async (mechanism) => {
    const { statuses, session } = await connectWith(mechanism, 'wrong');
    expect(statuses.at(-1)).toMatchObject({ state: 'error' });
    expect(statuses.at(-1)?.detail).toMatch(/^Authentication failed/);
    expect(session.isActive).toBe(false);
  });
});

describe.skipIf(!tlsBroker)('Kafka TLS against a real broker', () => {
  const sessions: KafkaSession[] = [];

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.disconnect(false)));
  });

  async function connectTls(address: string, tls: KafkaConnectionConfig['tls']) {
    const created = createSession();
    sessions.push(created.session);
    await created.session.connect({ brokers: [address], topics: [uniqueName('routiq-engine-tls')], fromBeginning: false, ssl: true, tls });
    return created;
  }

  const certificate = (name: string) => join(certsDirectory, name);

  it('connects when the broker CA is trusted', async () => {
    const { statuses } = await connectTls(tlsBroker ?? '', { ca: certificate('ca.pem'), rejectUnauthorized: true });
    expect(statuses.at(-1)?.state).toBe('connected');
  });

  it('reports a friendly TLS error when the CA is not trusted', async () => {
    const { statuses } = await connectTls(tlsBroker ?? '', undefined);
    expect(statuses.at(-1)).toMatchObject({ state: 'error' });
    expect(statuses.at(-1)?.detail).toMatch(/^TLS error/);
  });

  it.skipIf(!mtlsBroker)('connects to an mTLS listener with a client certificate', async () => {
    const { statuses } = await connectTls(mtlsBroker ?? '', {
      ca: certificate('ca.pem'),
      cert: certificate('client.pem'),
      keyPath: certificate('client.key'),
      rejectUnauthorized: true,
    });
    expect(statuses.at(-1)?.state).toBe('connected');
  });
});

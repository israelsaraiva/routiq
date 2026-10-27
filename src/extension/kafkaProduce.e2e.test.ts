import { afterEach, describe, expect, it } from 'vitest';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { parseJsonFile, parseNdjson } from '../core/kafka/jsonLogParser';
import { exportAsJson, exportAsNdjson, messagesFromLogEntries } from '../core/kafka/messageExport';
import { createKafkaProfile } from '../core/kafka/profiles';
import { planReplay } from '../core/kafka/replayPlan';
import { EMPTY_SEND_DRAFT, buildSendJobRequest } from '../core/kafka/sendJob';
import { KafkaReplayRequest } from '../shared/kafkaProduceTypes';
import { KafkaMessage } from '../shared/types';
import { createKafkaClient } from './kafkaClient';
import { KafkaProducerJobs } from './kafkaProducerJobs';
import { KafkaSession } from './kafkaSession';

const broker = process.env.ROUTIQ_KAFKA_E2E_BROKER;
const WAIT_TIMEOUT_MS = 20000;
const profile = createKafkaProfile('E2E', () => 'e2e');

const uniqueName = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const configFor = (topic: string): KafkaConnectionConfig => ({ brokers: [broker ?? ''], topics: [topic], fromBeginning: true, ssl: false });

async function waitFor(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe.skipIf(!broker)('produce, replay and export against a real broker', () => {
  const sessions: KafkaSession[] = [];
  const jobs = new KafkaProducerJobs(createKafkaClient, { connectionTimeoutMs: 5000 });

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.disconnect(false)));
  });

  async function consume(topic: string, expected: number): Promise<KafkaMessage[]> {
    const messages: KafkaMessage[] = [];
    const session = new KafkaSession(createKafkaClient, { onMessage: (message) => messages.push(message), onStatus: () => undefined }, { connectionTimeoutMs: 5000 });
    sessions.push(session);
    await session.connect(configFor(topic));
    await waitFor(() => messages.length >= expected, `${expected} messages on ${topic}`);
    return messages;
  }

  const sendDraft = (topic: string, overrides: Partial<typeof EMPTY_SEND_DRAFT>) => buildSendJobRequest(uniqueName('job'), profile, { ...EMPTY_SEND_DRAFT, topic, ...overrides }, {});
  const noop = () => undefined;

  it('sends N templated copies, a tombstone and an explicit partition', async () => {
    const topic = uniqueName('routiq-e2e-send');
    const copies = await jobs.runSend(configFor(topic), sendDraft(topic, { key: 'k-{{$index}}', value: '{"id":"{{$uuid}}","n":{{$index}}}', count: '5' }), {}, noop);
    expect(copies).toMatchObject({ state: 'done', sent: 5, failed: 0 });
    const tombstone = await jobs.runSend(configFor(topic), sendDraft(topic, { key: 'gone', tombstone: true }), {}, noop);
    expect(tombstone).toMatchObject({ state: 'done', sent: 1 });
    const explicit = await jobs.runSend(configFor(topic), sendDraft(topic, { key: 'pinned', value: 'p', partition: '2', acks: 'leader', compression: 'gzip' }), {}, noop);
    expect(explicit.partitionCounts).toEqual({ '2': 1 });

    const messages = await consume(topic, 7);
    const templated = messages.filter((message) => message.key?.startsWith('k-'));
    expect(new Set(templated.map((message) => JSON.parse(message.value).id)).size).toBe(5);
    expect(templated.map((message) => JSON.parse(message.value).n).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(messages.find((message) => message.key === 'gone')?.value).toBe('');
    expect(messages.find((message) => message.key === 'pinned')).toMatchObject({ partition: 2, value: 'p' });
  });

  it('replays to another topic preserving key, headers and value, and round trips an export', async () => {
    const source = uniqueName('routiq-e2e-source');
    const target = uniqueName('routiq-e2e-target');
    await jobs.runSend(configFor(source), { ...sendDraft(source, { key: 'order-{{$index}}', value: 'ünï "q", {{$index}}\nline2', count: '3' }), headers: { trace: 'abc', tenant: 'acme' } }, {}, noop);
    const received = await consume(source, 3);

    const plan = planReplay({
      messages: received,
      sourceProfile: profile,
      targetProfile: profile,
      targetTopic: target,
      partitionMode: 'auto',
      explicitPartition: null,
      keepTimestamps: false,
      compression: 'none',
      acks: 'all',
    });
    expect(plan).toMatchObject({ count: 3, sameTopic: false });
    const request: KafkaReplayRequest = {
      jobId: 'replay',
      targetProfile: profile,
      targetTopic: target,
      messages: received,
      partitionMode: 'auto',
      explicitPartition: null,
      keepTimestamps: false,
      ratePerSecond: 0,
      compression: 'none',
      acks: 'all',
    };
    expect(await jobs.runReplay(configFor(target), request, plan.records, noop)).toMatchObject({ state: 'done', sent: 3 });

    const replayed = await consume(target, 3);
    const shape = (messages: KafkaMessage[]) => messages.map(({ key, value, headers }) => ({ key, value, headers })).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    expect(shape(replayed)).toEqual(shape(received));

    const fromJson = messagesFromLogEntries(parseJsonFile(exportAsJson(replayed)).entries);
    const fromNdjson = messagesFromLogEntries(parseNdjson(exportAsNdjson(replayed)).entries);
    for (const imported of [fromJson, fromNdjson]) {
      expect(imported.map(({ topic, partition, offset, key, value, headers }) => ({ topic, partition, offset, key, value, headers }))).toEqual(
        replayed.map(({ topic, partition, offset, key, value, headers }) => ({ topic, partition, offset, key, value, headers })),
      );
    }
  });
});

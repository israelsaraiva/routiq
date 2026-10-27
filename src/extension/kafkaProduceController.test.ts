import { describe, expect, it, vi } from 'vitest';
import { createKafkaProfile } from '../core/kafka/profiles';
import { EMPTY_SEND_DRAFT, buildSendJobRequest } from '../core/kafka/sendJob';
import { KafkaReplayRequest } from '../shared/kafkaProduceTypes';
import { KafkaHostMessage, KafkaMessage, KafkaProfile } from '../shared/types';
import { KafkaClientFactory, KafkaProducedRecord } from './kafkaClient';
import { KafkaProduceController, ProduceEnvironment } from './kafkaProduceController';
import { KafkaProducerJobs } from './kafkaProducerJobs';

const source: KafkaProfile = { ...createKafkaProfile('Source', () => 'src'), brokers: 'src:9092' };
const target: KafkaProfile = { ...createKafkaProfile('Target', () => 'tgt'), brokers: 'tgt:9092' };

function setup(stored: KafkaProfile[] = [source, target], confirmations: boolean[] = [true, true]) {
  const sent: KafkaProducedRecord[] = [];
  const producer = { connect: async () => undefined, disconnect: async () => undefined, send: vi.fn(async (record: KafkaProducedRecord) => (sent.push(record), { partition: 0, offset: String(sent.length) })) };
  const factory: KafkaClientFactory = () => ({ createConsumer: () => { throw new Error('unused'); }, createOffsetLookup: () => { throw new Error('unused'); }, createProducer: () => producer });
  const posted: KafkaHostMessage[] = [];
  const confirm = vi.fn(async (_options: { message: string }) => confirmations.shift() ?? false);
  const saveExport = vi.fn(async () => undefined);
  const environment: ProduceEnvironment = {
    resolveConnection: async (draft) => ({ config: { brokers: draft.brokers.split(','), topics: [], fromBeginning: false, ssl: false }, variables: { env: 'dev' } }),
    storedProfile: (id) => stored.find((profile) => profile.id === id),
    post: (message) => void posted.push(message),
    confirm,
    saveExport,
    templates: { list: () => [], save: async () => [], remove: async () => [] },
  };
  const controller = new KafkaProduceController(environment, new KafkaProducerJobs(factory, { connectionTimeoutMs: 100 }));
  const lastProgress = () => [...posted].reverse().find((message) => message.type === 'kafkaJobProgress');
  return { controller, sent, posted, confirm, saveExport, lastProgress };
}

const message = (id: string, offset: string): KafkaMessage => ({ id, flowId: 'f', timestamp: Number(offset), topic: 'orders', partition: 0, offset, key: `k${id}`, value: `v${id}`, headers: { h: id } });
const replayRequest = (overrides: Partial<KafkaReplayRequest> = {}): KafkaReplayRequest => ({
  jobId: 'r1',
  sourceProfile: { id: 'src', brokers: 'src:9092' },
  targetProfile: target,
  targetTopic: 'orders-{{env}}',
  messages: [message('b', '2'), message('a', '1')],
  partitionMode: 'auto',
  explicitPartition: null,
  keepTimestamps: false,
  ratePerSecond: 0,
  compression: 'none',
  acks: 'all',
  ...overrides,
});

describe('KafkaProduceController.send', () => {
  const request = (profile: KafkaProfile = source) => buildSendJobRequest('j1', profile, { ...EMPTY_SEND_DRAFT, topic: 't-{{env}}', value: 'v', count: '2' }, {});

  it('sends and resolves variables in the topic', async () => {
    const { controller, sent, lastProgress } = setup();
    await controller.send(request());
    expect(sent.map((record) => record.topic)).toEqual(['t-dev', 't-dev']);
    expect(lastProgress()).toMatchObject({ progress: { state: 'done', sent: 2 } });
  });

  it('refuses read-only connections, whether stored or only in the draft', async () => {
    const readOnly = { ...source, readOnly: true };
    const stored = setup([readOnly]);
    await stored.controller.send(request(source));
    expect(stored.sent).toHaveLength(0);
    expect(stored.lastProgress()).toMatchObject({ progress: { state: 'failed', detail: expect.stringContaining('read-only') } });
    const draftOnly = setup();
    await draftOnly.controller.send(request(readOnly));
    expect(draftOnly.sent).toHaveLength(0);
  });

  it('rejects invalid requests without touching the broker', async () => {
    const { controller, sent, lastProgress } = setup();
    await controller.send({ ...request(), count: 0 });
    expect(sent).toHaveLength(0);
    expect(lastProgress()).toMatchObject({ progress: { state: 'failed', detail: expect.stringContaining('Count') } });
  });
});

describe('KafkaProduceController.replay', () => {
  it('confirms the target cluster and topic, then replays in order', async () => {
    const { controller, sent, confirm, lastProgress } = setup();
    await controller.replay(replayRequest());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatchObject({ message: expect.stringContaining('"orders-dev" on "Target" (tgt:9092)') });
    expect(sent.map((record) => [record.key, record.value, record.headers.h])).toEqual([['ka', 'va', 'a'], ['kb', 'vb', 'b']]);
    expect(lastProgress()).toMatchObject({ progress: { kind: 'replay', state: 'done', sent: 2 } });
  });

  it('does nothing when the confirmation is declined', async () => {
    const { controller, sent, lastProgress } = setup(undefined, [false]);
    await controller.replay(replayRequest());
    expect(sent).toHaveLength(0);
    expect(lastProgress()).toMatchObject({ progress: { state: 'stopped', detail: 'Replay cancelled' } });
  });

  it('requires an extra confirmation when replaying into the source topic of the same connection', async () => {
    const declined = setup(undefined, [true, false]);
    await declined.controller.replay(replayRequest({ targetProfile: source, targetTopic: 'orders' }));
    expect(declined.confirm).toHaveBeenCalledTimes(2);
    expect(declined.confirm.mock.calls[1][0].message).toContain('SAME topic');
    expect(declined.sent).toHaveLength(0);
    const accepted = setup();
    await accepted.controller.replay(replayRequest({ targetProfile: source, targetTopic: 'orders' }));
    expect(accepted.sent).toHaveLength(2);
  });

  it('blocks read-only targets before any confirmation', async () => {
    const { controller, sent, confirm, lastProgress } = setup([source, { ...target, readOnly: true }]);
    await controller.replay(replayRequest());
    expect(confirm).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(lastProgress()).toMatchObject({ progress: { state: 'failed', detail: expect.stringContaining('read-only') } });
  });
});

describe('KafkaProduceController.exportMessages', () => {
  it('serializes in the chosen format and delegates saving', async () => {
    const { controller, saveExport } = setup();
    await controller.exportMessages('csv', 'x.csv', [message('a', '1')]);
    expect(saveExport).toHaveBeenCalledWith('csv', 'x.csv', expect.stringContaining('topic,partition,offset'));
  });
});

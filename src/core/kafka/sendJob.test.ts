import { describe, expect, it } from 'vitest';
import { KafkaSendJobRequest } from '../../shared/kafkaProduceTypes';
import { createKafkaProfile } from './profiles';
import { EMPTY_SEND_DRAFT, MAX_SEND_COUNT, buildSendJobRequest, readOnlyReason, totalMessages, validateSendJob } from './sendJob';
import { applyTemplate, normalizeStoredTemplates, removeTemplate, templateFromDraft, upsertTemplate } from './sendTemplates';

const profile = createKafkaProfile('Local', () => 'p1');
const validRequest = (overrides: Partial<KafkaSendJobRequest> = {}): KafkaSendJobRequest => ({
  ...buildSendJobRequest('j1', profile, { ...EMPTY_SEND_DRAFT, topic: 't', value: 'v' }, {}),
  ...overrides,
});

describe('buildSendJobRequest', () => {
  it('maps the draft to a request', () => {
    const request = buildSendJobRequest(
      'j1',
      profile,
      { ...EMPTY_SEND_DRAFT, topic: 't', key: 'k', value: 'v', partition: '2', count: '5', ratePerSecond: '2.5', repeat: true, repeatIntervalSeconds: '1.5', repeatMaxRuns: '3', acks: 'leader', compression: 'gzip' },
      { a: 'b' },
    );
    expect(request).toMatchObject({ key: 'k', partition: 2, count: 5, ratePerSecond: 2.5, repeatIntervalMs: 1500, repeatMaxRuns: 3, acks: 'leader', compression: 'gzip', headers: { a: 'b' }, tombstone: false });
  });

  it('uses auto partition, null key and an empty value for tombstones', () => {
    const request = buildSendJobRequest('j1', profile, { ...EMPTY_SEND_DRAFT, topic: 't', value: 'ignored', tombstone: true }, {});
    expect(request).toMatchObject({ key: null, partition: null, value: '', tombstone: true, repeatIntervalMs: 0, repeatMaxRuns: 1 });
  });
});

describe('validateSendJob', () => {
  it('accepts a valid request and a tombstone without value', () => {
    expect(validateSendJob(validRequest())).toBeUndefined();
    expect(validateSendJob(validRequest({ value: '', tombstone: true }))).toBeUndefined();
  });

  it.each([
    [{ topic: ' ' }, 'topic'],
    [{ value: '' }, 'value'],
    [{ count: 0 }, 'Count'],
    [{ count: MAX_SEND_COUNT + 1 }, 'Count'],
    [{ partition: -1 }, 'Partition'],
    [{ repeatIntervalMs: 10, repeatMaxRuns: 2 }, 'at least'],
    [{ repeatIntervalMs: 1000, repeatMaxRuns: 0 }, 'cap'],
    [{ repeatIntervalMs: 1000, repeatMaxRuns: 5000 }, 'cap'],
  ])('rejects %j', (overrides, fragment) => {
    expect(validateSendJob(validRequest(overrides))).toContain(fragment);
  });

  it('computes the total across repeat runs', () => {
    expect(totalMessages({ count: 4, repeatMaxRuns: 3, repeatIntervalMs: 1000 })).toBe(12);
    expect(totalMessages({ count: 4, repeatMaxRuns: 3, repeatIntervalMs: 0 })).toBe(4);
  });
});

describe('readOnlyReason', () => {
  it('explains why a read-only connection cannot produce', () => {
    expect(readOnlyReason({ name: 'Prod', readOnly: true })).toContain('"Prod" is read-only');
    expect(readOnlyReason({ name: 'Dev', readOnly: false })).toBeUndefined();
    expect(readOnlyReason(undefined)).toBeUndefined();
  });
});

describe('saved templates', () => {
  const draft = { ...EMPTY_SEND_DRAFT, topic: 't', key: 'k', value: '{{$uuid}}', headers: '{"a":"b"}', partition: '1' };

  it('round trips a draft through a template', () => {
    const template = templateFromDraft('id1', 'My template', draft);
    expect(template).toEqual({ id: 'id1', name: 'My template', topic: 't', key: 'k', headers: { a: 'b' }, value: '{{$uuid}}', partition: 1, tombstone: false });
    expect(applyTemplate(EMPTY_SEND_DRAFT, template)).toMatchObject({ topic: 't', key: 'k', value: '{{$uuid}}', partition: '1' });
  });

  it('upserts by id or name and removes', () => {
    const first = templateFromDraft('1', 'A', draft);
    const renamedValue = upsertTemplate([first], { ...first, id: '2', value: 'new' });
    expect(renamedValue).toHaveLength(1);
    expect(renamedValue[0]).toMatchObject({ id: '1', value: 'new' });
    expect(removeTemplate(renamedValue, '1')).toEqual([]);
  });

  it('ignores malformed stored entries and fills defaults', () => {
    expect(normalizeStoredTemplates([{ id: 'x', name: 'n', value: 'v' }, 5, { id: 1 }])).toEqual([
      { id: 'x', name: 'n', value: 'v', topic: '', key: '', headers: {}, partition: null, tombstone: false },
    ]);
    expect(normalizeStoredTemplates(undefined)).toEqual([]);
  });
});

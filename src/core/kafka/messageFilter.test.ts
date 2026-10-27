import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { EMPTY_FILTER, advancedFilterCount, compileFilter, formatDateTimeLocal, parseDateTimeLocal, filterByStructuredFilter, isErrorMessage, validateJsonPathCondition, validateRegex } from './messageFilter';

const message = (patch: Partial<KafkaMessage>): KafkaMessage => ({
  id: 'm',
  flowId: 'flow-1',
  timestamp: 1000,
  topic: 'orders',
  partition: 0,
  offset: '1',
  key: 'order-7',
  value: '{"status":"FAILED","amount":42,"items":[{"sku":"a"},{"sku":"b"}]}',
  headers: { traceId: 'abc-123' },
  ...patch,
});

const run = (patch: Partial<typeof EMPTY_FILTER>, messages = [message({})]) => filterByStructuredFilter(messages, { ...EMPTY_FILTER, ...patch });

describe('message filter', () => {
  it('matches free text case-insensitively by default and case-sensitively on request', () => {
    expect(run({ text: 'failed' })).toHaveLength(1);
    expect(run({ text: 'failed', caseSensitive: true })).toHaveLength(0);
  });

  it('limits free text to the chosen scope', () => {
    expect(run({ text: 'order-7', scope: 'key' })).toHaveLength(1);
    expect(run({ text: 'order-7', scope: 'value' })).toHaveLength(0);
    expect(run({ text: 'abc-123', scope: 'headers' })).toHaveLength(1);
    expect(run({ text: 'abc-123', scope: 'key' })).toHaveLength(0);
  });

  it('supports regular expressions', () => {
    expect(run({ text: 'FAIL(ED|URE)', regex: true })).toHaveLength(1);
    expect(run({ text: '^nothing$', regex: true })).toHaveLength(0);
  });

  it('reports invalid or dangerous regular expressions without throwing', () => {
    expect(compileFilter({ ...EMPTY_FILTER, text: '(', regex: true }).error).toBeDefined();
    expect(validateRegex('(a+)+$')).toMatch(/expensive/);
    expect(validateRegex('a'.repeat(201))).toMatch(/longer/);
    expect(run({ text: '(', regex: true })).toHaveLength(1);
  });

  it('evaluates json path conditions and existence', () => {
    expect(run({ jsonPath: "$.status == 'FAILED'" })).toHaveLength(1);
    expect(run({ jsonPath: "$.status == 'OK'" })).toHaveLength(0);
    expect(run({ jsonPath: '$.amount > 40' })).toHaveLength(1);
    expect(run({ jsonPath: '$.amount <= 41' })).toHaveLength(0);
    expect(run({ jsonPath: '$.status != "OK"' })).toHaveLength(1);
    expect(run({ jsonPath: '$.items[1].sku' })).toHaveLength(1);
    expect(run({ jsonPath: '$.missing' })).toHaveLength(0);
    expect(run({ jsonPath: "$.items.*.sku == 'b'" })).toHaveLength(1);
  });

  it('excludes non-json values from json path conditions', () => {
    expect(run({ jsonPath: '$.a' }, [message({ value: 'plain' })])).toHaveLength(0);
  });

  it('flags malformed json paths', () => {
    expect(validateJsonPathCondition('$.[')).toBe('Invalid JSON path');
    expect(validateJsonPathCondition("$.a == 'x'")).toBeUndefined();
  });

  it('filters by header key and optional value', () => {
    expect(run({ headerKey: 'TRACEID' })).toHaveLength(1);
    expect(run({ headerKey: 'traceId', headerValue: 'abc' })).toHaveLength(1);
    expect(run({ headerKey: 'traceId', headerValue: 'zzz' })).toHaveLength(0);
    expect(run({ headerKey: 'other' })).toHaveLength(0);
  });

  it('filters by partition and time range', () => {
    const messages = [message({ id: 'a', partition: 1, timestamp: 100 }), message({ id: 'b', partition: 2, timestamp: 200 })];
    expect(run({ partition: 2 }, messages).map((m) => m.id)).toEqual(['b']);
    expect(run({ fromTime: 150 }, messages).map((m) => m.id)).toEqual(['b']);
    expect(run({ toTime: 150 }, messages).map((m) => m.id)).toEqual(['a']);
  });

  it('keeps only errors when asked', () => {
    const ok = message({ id: 'ok', value: '{"status":"OK"}' });
    const levelled = message({ id: 'lvl', value: '{}', level: 'ERROR' });
    expect(isErrorMessage(ok)).toBe(false);
    expect(run({ errorsOnly: true }, [ok, levelled, message({ id: 'failed' })]).map((m) => m.id)).toEqual(['lvl', 'failed']);
  });
});

describe('filter helpers', () => {
  it('round-trips datetime-local values', () => {
    const stamp = new Date(2024, 4, 3, 7, 9).getTime();
    expect(formatDateTimeLocal(stamp)).toBe('2024-05-03T07:09');
    expect(parseDateTimeLocal('2024-05-03T07:09')).toBe(stamp);
    expect(parseDateTimeLocal('')).toBeNull();
  });

  it('counts the active advanced criteria', () => {
    expect(advancedFilterCount({ ...EMPTY_FILTER, jsonPath: '$.a', errorsOnly: true, partition: 0 })).toBe(3);
    expect(advancedFilterCount(EMPTY_FILTER)).toBe(0);
  });
});

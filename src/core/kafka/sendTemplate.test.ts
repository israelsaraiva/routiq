import { describe, expect, it } from 'vitest';
import { DynamicSources } from '../variables';
import { resolveMessageTemplate, usesPerMessageVariables } from './sendTemplate';

function sequencedSources(): DynamicSources {
  let counter = 0;
  return { nowMs: () => Date.UTC(2024, 0, 2, 3, 4, 5), random: () => 0.5, uuid: () => `uuid-${++counter}` };
}

describe('resolveMessageTemplate', () => {
  it('produces a different value for every message', () => {
    const sources = sequencedSources();
    const template = { key: '{{$uuid}}', value: '{"id":"{{$uuid}}","n":{{$index}}}', headers: { trace: '{{$uuid}}' } };
    const first = resolveMessageTemplate(template, {}, 1, sources);
    const second = resolveMessageTemplate(template, {}, 2, sources);
    expect(first).toEqual({ key: 'uuid-1', value: '{"id":"uuid-2","n":1}', headers: { trace: 'uuid-3' } });
    expect(second.value).toBe('{"id":"uuid-5","n":2}');
  });

  it('resolves timestamps, random ints and collection variables', () => {
    const resolved = resolveMessageTemplate(
      { key: null, value: '{{$timestamp}}|{{$isoTimestamp}}|{{$randomInt}}|{{tenant}}|{{unknown}}', headers: {} },
      { tenant: 'acme' },
      1,
      sequencedSources(),
    );
    expect(resolved.key).toBeNull();
    expect(resolved.value).toBe('1704164645|2024-01-02T03:04:05.000Z|500|acme|{{unknown}}');
  });

  it('lets collection variables override the index and resolves header names', () => {
    const resolved = resolveMessageTemplate({ key: 'k', value: '{{$index}}', headers: { 'x-{{env}}': 'v' } }, { env: 'dev', $index: 'fixed' }, 9, sequencedSources());
    expect(resolved).toEqual({ key: 'k', value: 'fixed', headers: { 'x-dev': 'v' } });
  });
});

describe('usesPerMessageVariables', () => {
  it('detects dynamic variables anywhere in the template', () => {
    expect(usesPerMessageVariables({ key: null, value: 'plain', headers: {} })).toBe(false);
    expect(usesPerMessageVariables({ key: null, value: 'plain', headers: { a: '{{$uuid}}' } })).toBe(true);
    expect(usesPerMessageVariables({ key: null, value: '{{tenant}}', headers: {} })).toBe(false);
  });
});

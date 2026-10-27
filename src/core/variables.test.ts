import { describe, expect, it } from 'vitest';
import { DynamicSources, substituteVariables, variablesToMap } from './variables';

describe('substituteVariables', () => {
  it('replaces known placeholders, tolerating inner whitespace', () => {
    expect(substituteVariables('{{host}}/a/{{ id }}', { host: 'http://x', id: '7' })).toBe('http://x/a/7');
  });

  it('keeps unknown placeholders untouched', () => {
    expect(substituteVariables('{{missing}}', {})).toBe('{{missing}}');
  });
});

describe('variablesToMap', () => {
  it('skips disabled and keyless entries', () => {
    const map = variablesToMap([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: false },
      { key: '', value: '3', enabled: true },
    ]);
    expect(map).toEqual({ a: '1' });
  });
});

describe('dynamic variables', () => {
  const sources: DynamicSources = { nowMs: () => 1_700_000_000_123, random: () => 0.5, uuid: () => 'fixed-uuid' };

  it('resolves generators from injected sources', () => {
    expect(substituteVariables('{{$uuid}}|{{$timestamp}}|{{$timestampMs}}|{{ $isoTimestamp }}', {}, sources)).toBe(
      'fixed-uuid|1700000000|1700000000123|2023-11-14T22:13:20.123Z',
    );
    expect(substituteVariables('{{$randomInt}}|{{$randomBoolean}}', {}, sources)).toBe('500|false');
    expect(substituteVariables('{{$randomString}}', {}, sources)).toHaveLength(16);
  });

  it('lets user variables override and leaves unknown dynamic names', () => {
    expect(substituteVariables('{{$uuid}}', { $uuid: 'mine' }, sources)).toBe('mine');
    expect(substituteVariables('{{$nope}}', {}, sources)).toBe('{{$nope}}');
  });

  it('generates real values by default', () => {
    expect(substituteVariables('{{$uuid}}', {})).toMatch(/^[0-9a-f-]{36}$/);
  });
});

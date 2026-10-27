import { describe, expect, it } from 'vitest';
import { buildUrl } from './url';

const param = (key: string, value: string, enabled = true) => ({ key, value, enabled });

describe('buildUrl', () => {
  it('appends enabled params encoded', () => {
    expect(buildUrl('http://a/b', [param('q', 'a b'), param('off', '1', false)])).toBe('http://a/b?q=a%20b');
  });

  it('extends an existing query string', () => {
    expect(buildUrl('http://a/b?x=1', [param('y', '2')])).toBe('http://a/b?x=1&y=2');
  });

  it('keeps the fragment at the end', () => {
    expect(buildUrl('http://a/b#top', [param('y', '2')])).toBe('http://a/b?y=2#top');
  });

  it('returns the url unchanged without params', () => {
    expect(buildUrl('http://a/b', [])).toBe('http://a/b');
  });
});

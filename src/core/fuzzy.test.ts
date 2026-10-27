import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatches, fuzzyScore } from './fuzzy';

describe('fuzzy matching', () => {
  it('matches in-order subsequences case-insensitively', () => {
    expect(fuzzyMatches('gtusr', 'Get Users')).toBe(true);
    expect(fuzzyMatches('usg', 'Get Users')).toBe(false);
  });

  it('ranks prefix and consecutive matches above scattered ones', () => {
    expect(fuzzyScore('user', 'users')!).toBeGreaterThan(fuzzyScore('user', 'a-u-s-e-r')!);
  });

  it('keeps original order for an empty query and sorts by score otherwise', () => {
    expect(fuzzyFilter(['b', 'a'], '  ', (item) => item)).toEqual(['b', 'a']);
    expect(fuzzyFilter(['xauth', 'auth', 'nope'], 'auth', (item) => item)).toEqual(['auth', 'xauth']);
  });
});

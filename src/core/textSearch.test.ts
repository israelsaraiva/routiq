import { describe, expect, it } from 'vitest';
import { findMatches, splitTokensByMatches, wrapIndex } from './textSearch';

describe('textSearch', () => {
  it('finds case-insensitive non-overlapping matches', () => {
    expect(findMatches('aAa', 'aa')).toEqual([{ start: 0, end: 2 }]);
    expect(findMatches('abc', '')).toEqual([]);
  });

  it('wraps indexes', () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(1, 0)).toBe(0);
  });

  it('splits tokens across match boundaries', () => {
    const tokens = [
      { kind: 'key' as const, text: '"abc"' },
      { kind: 'plain' as const, text: ': x' },
    ];
    const segments = splitTokensByMatches(tokens, [{ start: 2, end: 4 }, { start: 5, end: 7 }]);
    expect(segments.map((segment) => segment.text).join('')).toBe('"abc": x');
    expect(segments.filter((segment) => segment.matchIndex !== undefined)).toEqual([
      { kind: 'key', text: 'bc', matchIndex: 0 },
      { kind: 'plain', text: ': ', matchIndex: 1 },
    ]);
  });
});

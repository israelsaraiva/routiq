import { describe, expect, it } from 'vitest';
import { MATCHER_NAMES, deepEqual, evaluateMatcher } from './assertions';

function passes(name: string, actual: unknown, expected: unknown[] = [], negated = false): boolean {
  return evaluateMatcher(name, actual, expected, negated).pass;
}

describe('deepEqual', () => {
  it('compares nested structures by value', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });
});

describe('evaluateMatcher', () => {
  it('supports equality matchers', () => {
    expect(passes('toBe', 200, [200])).toBe(true);
    expect(passes('toBe', { a: 1 }, [{ a: 1 }])).toBe(false);
    expect(passes('toEqual', { a: 1 }, [{ a: 1 }])).toBe(true);
  });

  it('supports ordering matchers and rejects mixed types', () => {
    expect(passes('toBeGreaterThan', 3, [2])).toBe(true);
    expect(passes('toBeGreaterThan', 2, [2])).toBe(false);
    expect(passes('toBeGreaterThanOrEqual', 2, [2])).toBe(true);
    expect(passes('toBeLessThan', 1, [2])).toBe(true);
    expect(passes('toBeLessThanOrEqual', 3, [2])).toBe(false);
    expect(passes('toBeGreaterThan', '3', [2])).toBe(false);
  });

  it('supports contain, length, match and property matchers', () => {
    expect(passes('toContain', 'hello', ['ell'])).toBe(true);
    expect(passes('toContain', [1, { a: 1 }], [{ a: 1 }])).toBe(true);
    expect(passes('toHaveLength', [1, 2], [2])).toBe(true);
    expect(passes('toMatch', 'abc123', [/\d+/])).toBe(true);
    expect(passes('toMatch', 'abc', ['b'])).toBe(true);
    expect(passes('toHaveProperty', { a: { b: 5 } }, ['a.b', 5])).toBe(true);
    expect(passes('toHaveProperty', { a: {} }, ['a.b'])).toBe(false);
  });

  it('supports truthiness and nullish matchers', () => {
    expect(passes('toBeTruthy', 'x')).toBe(true);
    expect(passes('toBeFalsy', 0)).toBe(true);
    expect(passes('toBeNull', null)).toBe(true);
    expect(passes('toBeUndefined', undefined)).toBe(true);
    expect(passes('toBeDefined', null)).toBe(true);
  });

  it('inverts the verdict when negated and words the message accordingly', () => {
    const verdict = evaluateMatcher('toBe', 1, [1], true);
    expect(verdict.pass).toBe(false);
    expect(verdict.message).toBe('expected 1 not to be 1');
  });

  it('describes failures and rejects unknown matchers', () => {
    expect(evaluateMatcher('toBeGreaterThan', 1, [5]).message).toBe('expected 1 to be greater than 5');
    expect(evaluateMatcher('toBeWhatever', 1, []).pass).toBe(false);
    expect(MATCHER_NAMES).toContain('toEqual');
  });
});

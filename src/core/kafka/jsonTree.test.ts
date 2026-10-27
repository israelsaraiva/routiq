import { describe, expect, it } from 'vitest';
import { appendPath, collectContainerPaths, findAncestorsOfMatches } from './jsonTree';

describe('json tree helpers', () => {
  it('builds paths compatible with the json path evaluator', () => {
    expect(appendPath(appendPath('$', 'a'), 0)).toBe('$.a[0]');
    expect(appendPath('$', 'with space')).toBe("$['with space']");
  });

  it('collects container paths up to a limit', () => {
    expect(collectContainerPaths({ a: [1, { b: 2 }], c: 3 })).toEqual(['$', '$.a', '$.a[1]']);
    expect(collectContainerPaths({ a: {}, b: {} }, '$', 2)).toEqual(['$', '$.a']);
  });

  it('finds the ancestors of matching nodes', () => {
    const ancestors = findAncestorsOfMatches({ a: { b: 'needle' }, c: { d: 'hay' } }, 'NEEDLE');
    expect([...ancestors].sort()).toEqual(['$', '$.a']);
    expect(findAncestorsOfMatches({ a: 1 }, '').size).toBe(0);
  });
});

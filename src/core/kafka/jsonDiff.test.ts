import { describe, expect, it } from 'vitest';
import { diffJson, diffJsonSideBySide } from './jsonDiff';

describe('diffJson', () => {
  it('reports no changes for equal documents', () => {
    expect(diffJson({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });

  it('reports added, removed and changed paths', () => {
    expect(diffJson({ a: 1, b: { c: 'x' }, gone: true }, { a: 2, b: { c: 'x', d: 1 }, extra: 0 })).toEqual([
      { path: '$.a', kind: 'changed', left: 1, right: 2 },
      { path: '$.b.d', kind: 'added', right: 1 },
      { path: '$.gone', kind: 'removed', left: true },
      { path: '$.extra', kind: 'added', right: 0 },
    ]);
  });

  it('compares arrays by index and flags type changes', () => {
    expect(diffJson({ list: [1, 2] }, { list: [1] })).toEqual([{ path: '$.list[1]', kind: 'removed', left: 2 }]);
    expect(diffJson([], {})).toHaveLength(1);
  });
});

describe('diffJsonSideBySide', () => {
  it('aligns removed and added lines with blanks', () => {
    const { left, right } = diffJsonSideBySide({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(left.map((line) => line.kind)).toEqual(['same', 'same', 'removed', 'blank', 'same']);
    expect(right.map((line) => line.kind)).toEqual(['same', 'same', 'blank', 'added', 'same']);
    expect(right[3].text).toBe('  "b": 3');
  });

  it('ignores key order', () => {
    const { left } = diffJsonSideBySide({ a: 1, b: 2 }, { b: 2, a: 1 });
    expect(left.every((line) => line.kind === 'same')).toBe(true);
  });
});

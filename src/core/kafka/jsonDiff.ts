export type JsonChangeKind = 'added' | 'removed' | 'changed';

export interface JsonChange {
  path: string;
  kind: JsonChangeKind;
  left?: unknown;
  right?: unknown;
}

export type LineDiffKind = 'same' | 'added' | 'removed' | 'blank';

export interface DiffLine {
  kind: LineDiffKind;
  text: string;
}

export interface SideBySideDiff {
  left: DiffLine[];
  right: DiffLine[];
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function childPath(parent: string, key: string | number): string {
  return typeof key === 'number' ? `${parent}[${key}]` : /^[A-Za-z_][\w-]*$/.test(key) ? `${parent}.${key}` : `${parent}['${key}']`;
}

function entriesOf(value: Record<string, unknown> | unknown[]): Array<[string | number, unknown]> {
  return Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
}

export function diffJson(left: unknown, right: unknown, path = '$'): JsonChange[] {
  if (isContainer(left) && isContainer(right) && Array.isArray(left) === Array.isArray(right)) {
    return diffContainers(left, right, path);
  }
  return JSON.stringify(left) === JSON.stringify(right) ? [] : [{ path, kind: 'changed', left, right }];
}

function diffContainers(left: Record<string, unknown> | unknown[], right: Record<string, unknown> | unknown[], path: string): JsonChange[] {
  const leftEntries = new Map(entriesOf(left));
  const rightEntries = new Map(entriesOf(right));
  const keys = [...new Set([...leftEntries.keys(), ...rightEntries.keys()])];
  return keys.flatMap((key) => {
    const here = childPath(path, key);
    if (!rightEntries.has(key)) {
      return [{ path: here, kind: 'removed' as const, left: leftEntries.get(key) }];
    }
    if (!leftEntries.has(key)) {
      return [{ path: here, kind: 'added' as const, right: rightEntries.get(key) }];
    }
    return diffJson(leftEntries.get(key), rightEntries.get(key), here);
  });
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  return isContainer(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])])) : value;
}

export function prettyLines(value: unknown): string[] {
  return (typeof value === 'string' ? value : JSON.stringify(sortKeysDeep(value), null, 2) ?? '').split('\n');
}

export function diffLines(leftLines: string[], rightLines: string[]): SideBySideDiff {
  const table = buildLcsTable(leftLines, rightLines);
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < leftLines.length || j < rightLines.length) {
    if (i < leftLines.length && j < rightLines.length && leftLines[i] === rightLines[j]) {
      left.push({ kind: 'same', text: leftLines[i++] });
      right.push({ kind: 'same', text: rightLines[j++] });
    } else if (j >= rightLines.length || (i < leftLines.length && table[i + 1][j] >= table[i][j + 1])) {
      left.push({ kind: 'removed', text: leftLines[i++] });
      right.push({ kind: 'blank', text: '' });
    } else {
      left.push({ kind: 'blank', text: '' });
      right.push({ kind: 'added', text: rightLines[j++] });
    }
  }
  return { left, right };
}

function buildLcsTable(left: string[], right: string[]): number[][] {
  const table = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function diffJsonSideBySide(left: unknown, right: unknown): SideBySideDiff {
  return diffLines(prettyLines(left), prettyLines(right));
}

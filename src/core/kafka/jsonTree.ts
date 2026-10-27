export const MAX_AUTO_EXPANDED_NODES = 2000;
export const LONG_STRING_LENGTH = 200;

export type JsonNodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export function nodeKind(value: unknown): JsonNodeKind {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value === 'object' ? 'object' : (typeof value as 'string' | 'number' | 'boolean');
}

export function isContainerNode(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

export function childEntries(value: Record<string, unknown> | unknown[]): Array<[string | number, unknown]> {
  return Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
}

export function appendPath(parent: string, key: string | number): string {
  if (typeof key === 'number') {
    return `${parent}[${key}]`;
  }
  return /^[A-Za-z_][\w-]*$/.test(key) ? `${parent}.${key}` : `${parent}['${key.replace(/'/g, "\\'")}']`;
}

export function collectContainerPaths(value: unknown, path = '$', limit = MAX_AUTO_EXPANDED_NODES): string[] {
  const paths: string[] = [];
  const visit = (node: unknown, nodePath: string) => {
    if (!isContainerNode(node) || paths.length >= limit) {
      return;
    }
    paths.push(nodePath);
    childEntries(node).forEach(([key, child]) => visit(child, appendPath(nodePath, key)));
  };
  visit(value, path);
  return paths;
}

export function leafMatches(key: string | number | undefined, value: unknown, term: string): boolean {
  const needle = term.toLowerCase();
  const keyMatches = key !== undefined && String(key).toLowerCase().includes(needle);
  return keyMatches || (!isContainerNode(value) && String(value).toLowerCase().includes(needle));
}

export function findAncestorsOfMatches(value: unknown, term: string, limit = MAX_AUTO_EXPANDED_NODES): Set<string> {
  const ancestors = new Set<string>();
  if (!term.trim()) {
    return ancestors;
  }
  const visit = (node: unknown, key: string | number | undefined, path: string, trail: string[]): void => {
    if (ancestors.size >= limit) {
      return;
    }
    if (leafMatches(key, node, term)) {
      trail.forEach((ancestor) => ancestors.add(ancestor));
    }
    isContainerNode(node) && childEntries(node).forEach(([childKey, child]) => visit(child, childKey, appendPath(path, childKey), [...trail, path]));
  };
  visit(value, undefined, '$', []);
  return ancestors;
}

export function summarizeContainer(value: Record<string, unknown> | unknown[]): string {
  return Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
}

export interface TermSegment {
  text: string;
  match: boolean;
}

export function splitByTerm(text: string, term: string): TermSegment[] {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return [{ text, match: false }];
  }
  const segments: TermSegment[] = [];
  const haystack = text.toLowerCase();
  let cursor = 0;
  for (let found = haystack.indexOf(needle); found >= 0; found = haystack.indexOf(needle, cursor)) {
    found > cursor && segments.push({ text: text.slice(cursor, found), match: false });
    segments.push({ text: text.slice(found, found + needle.length), match: true });
    cursor = found + needle.length;
  }
  return cursor < text.length ? [...segments, { text: text.slice(cursor), match: false }] : segments;
}

export type JsonPathResult = { ok: true; value: unknown } | { ok: false; error: string };

type Segment = { kind: 'key'; key: string } | { kind: 'index'; index: number } | { kind: 'wildcard' };

const IDENTIFIER = /^[^.[\]\s]+/;

export function evaluateJsonPath(path: string, document: unknown): JsonPathResult {
  const segments = parseSegments(path.trim());
  if (!segments) {
    return { ok: false, error: 'Invalid path' };
  }
  const hasWildcard = segments.some((segment) => segment.kind === 'wildcard');
  const matches = segments.reduce<unknown[]>((nodes, segment) => nodes.flatMap((node) => step(node, segment)), [document]);
  if (hasWildcard) {
    return { ok: true, value: matches };
  }
  return matches.length > 0 ? { ok: true, value: matches[0] } : { ok: false, error: 'No match' };
}

function step(node: unknown, segment: Segment): unknown[] {
  if (segment.kind === 'wildcard') {
    return childValues(node);
  }
  if (segment.kind === 'index') {
    return Array.isArray(node) && segment.index < node.length ? [node.at(segment.index)] : [];
  }
  return isRecord(node) && Object.hasOwn(node, segment.key) ? [node[segment.key]] : [];
}

function childValues(node: unknown): unknown[] {
  if (Array.isArray(node)) {
    return node;
  }
  return isRecord(node) ? Object.values(node) : [];
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

function parseSegments(path: string): Segment[] | undefined {
  let rest = path.startsWith('$') ? path.slice(1) : path;
  const segments: Segment[] = [];
  let first = !path.startsWith('$');
  while (rest.length > 0) {
    const parsed = rest.startsWith('[') ? parseBracket(rest) : parseDotted(rest, first);
    if (!parsed) {
      return undefined;
    }
    segments.push(parsed.segment);
    rest = parsed.rest;
    first = false;
  }
  return segments;
}

function parseDotted(text: string, allowBare: boolean): { segment: Segment; rest: string } | undefined {
  const body = text.startsWith('.') ? text.slice(1) : allowBare ? text : undefined;
  if (body === undefined) {
    return undefined;
  }
  if (body.startsWith('*')) {
    return { segment: { kind: 'wildcard' }, rest: body.slice(1) };
  }
  const name = IDENTIFIER.exec(body)?.[0];
  return name ? { segment: { kind: 'key', key: name }, rest: body.slice(name.length) } : undefined;
}

function parseBracket(text: string): { segment: Segment; rest: string } | undefined {
  const close = findBracketEnd(text);
  if (close < 0) {
    return undefined;
  }
  const inner = text.slice(1, close).trim();
  const segment = parseBracketContent(inner);
  return segment ? { segment, rest: text.slice(close + 1) } : undefined;
}

function findBracketEnd(text: string): number {
  const quote = text[1] === '"' || text[1] === "'" ? text[1] : undefined;
  if (!quote) {
    return text.indexOf(']');
  }
  const closingQuote = text.indexOf(quote, 2);
  return closingQuote < 0 || text[closingQuote + 1] !== ']' ? -1 : closingQuote + 1;
}

function parseBracketContent(inner: string): Segment | undefined {
  if (inner === '*') {
    return { kind: 'wildcard' };
  }
  if (/^-?\d+$/.test(inner)) {
    return { kind: 'index', index: Number(inner) };
  }
  const quoted = /^(["'])(.*)\1$/.exec(inner);
  return quoted ? { kind: 'key', key: quoted[2] } : undefined;
}

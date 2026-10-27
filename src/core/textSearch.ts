import { SyntaxToken } from './syntaxTokens';

export interface TextRange {
  start: number;
  end: number;
}

export interface Segment {
  kind: SyntaxToken['kind'];
  text: string;
  matchIndex?: number;
}

export function findMatches(text: string, query: string): TextRange[] {
  if (query.length === 0) {
    return [];
  }
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const ranges: TextRange[] = [];
  for (let start = haystack.indexOf(needle); start >= 0; start = haystack.indexOf(needle, start + needle.length)) {
    ranges.push({ start, end: start + needle.length });
  }
  return ranges;
}

export function wrapIndex(index: number, count: number): number {
  return count === 0 ? 0 : ((index % count) + count) % count;
}

export function splitTokensByMatches(tokens: SyntaxToken[], matches: TextRange[]): Segment[] {
  const segments: Segment[] = [];
  let tokenStart = 0;
  let matchCursor = 0;
  for (const token of tokens) {
    const tokenEnd = tokenStart + token.text.length;
    let position = tokenStart;
    while (position < tokenEnd) {
      while (matchCursor < matches.length && matches[matchCursor].end <= position) {
        matchCursor += 1;
      }
      const match = matches[matchCursor];
      const inside = match !== undefined && match.start <= position;
      const sliceEnd = Math.min(tokenEnd, inside ? match.end : (match?.start ?? tokenEnd));
      const text = token.text.slice(position - tokenStart, sliceEnd - tokenStart);
      segments.push(inside ? { kind: token.kind, text, matchIndex: matchCursor } : { kind: token.kind, text });
      position = sliceEnd;
    }
    tokenStart = tokenEnd;
  }
  return segments;
}

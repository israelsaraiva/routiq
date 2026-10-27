export type GraphqlTokenKind =
  | 'keyword'
  | 'name'
  | 'variable'
  | 'directive'
  | 'string'
  | 'number'
  | 'comment'
  | 'punctuation'
  | 'whitespace'
  | 'unknown';

export interface GraphqlToken {
  kind: GraphqlTokenKind;
  text: string;
  start: number;
}

const KEYWORDS = new Set(['query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null', 'schema', 'type', 'interface', 'union', 'enum', 'input', 'scalar', 'extend', 'directive', 'implements']);

const TOKEN_PATTERNS: Array<{ kind: GraphqlTokenKind; pattern: RegExp }> = [
  { kind: 'whitespace', pattern: /[\s,]+/y },
  { kind: 'comment', pattern: /#[^\n\r]*/y },
  { kind: 'string', pattern: /"""[\s\S]*?(?:"""|$)|"(?:[^"\\\n\r]|\\.)*"?/y },
  { kind: 'variable', pattern: /\$[_A-Za-z][_0-9A-Za-z]*/y },
  { kind: 'directive', pattern: /@[_A-Za-z][_0-9A-Za-z]*/y },
  { kind: 'number', pattern: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
  { kind: 'name', pattern: /[_A-Za-z][_0-9A-Za-z]*/y },
  { kind: 'punctuation', pattern: /\.\.\.|[{}()[\]:=!|&]/y },
];

function matchAt(text: string, position: number): { kind: GraphqlTokenKind; text: string } {
  for (const { kind, pattern } of TOKEN_PATTERNS) {
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (match) {
      return { kind: kind === 'name' && KEYWORDS.has(match[0]) ? 'keyword' : kind, text: match[0] };
    }
  }
  return { kind: 'unknown', text: text[position] };
}

export function tokenizeGraphql(text: string): GraphqlToken[] {
  const tokens: GraphqlToken[] = [];
  let position = 0;
  while (position < text.length) {
    const token = matchAt(text, position);
    tokens.push({ ...token, start: position });
    position += token.text.length;
  }
  return tokens;
}

export function significantTokens(tokens: GraphqlToken[]): GraphqlToken[] {
  return tokens.filter((token) => token.kind !== 'whitespace' && token.kind !== 'comment');
}

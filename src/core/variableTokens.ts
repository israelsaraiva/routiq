export type VariableTokenKind = 'text' | 'defined' | 'undefined';

export interface VariableToken {
  kind: VariableTokenKind;
  text: string;
  name?: string;
}

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

function textToken(text: string): VariableToken[] {
  return text === '' ? [] : [{ kind: 'text', text }];
}

export function tokenizeVariables(text: string, knownNames: ReadonlySet<string>): VariableToken[] {
  const tokens: VariableToken[] = [];
  let cursor = 0;
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    tokens.push(...textToken(text.slice(cursor, match.index)));
    tokens.push({ kind: knownNames.has(name) ? 'defined' : 'undefined', text: match[0], name });
    cursor = match.index + match[0].length;
  }
  return [...tokens, ...textToken(text.slice(cursor))];
}

export function hasVariableTokens(tokens: VariableToken[]): boolean {
  return tokens.some((token) => token.kind !== 'text');
}

export function splitTokensAt(tokens: VariableToken[], offset: number): { before: VariableToken[]; after: VariableToken[] } {
  const before: VariableToken[] = [];
  const after: VariableToken[] = [];
  let position = 0;
  for (const token of tokens) {
    const end = position + token.text.length;
    if (end <= offset) {
      before.push(token);
    } else if (position >= offset) {
      after.push(token);
    } else {
      before.push({ ...token, text: token.text.slice(0, offset - position) });
      after.push({ ...token, text: token.text.slice(offset - position) });
    }
    position = end;
  }
  return { before, after };
}

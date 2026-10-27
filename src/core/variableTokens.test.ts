import { describe, expect, it } from 'vitest';
import { hasVariableTokens, splitTokensAt, tokenizeVariables } from './variableTokens';

const known = new Set(['host', 'token', '$uuid']);

describe('tokenizeVariables', () => {
  it('marks known and unknown variables', () => {
    expect(tokenizeVariables('{{host}}/a/{{id}}', known)).toEqual([
      { kind: 'defined', text: '{{host}}', name: 'host' },
      { kind: 'text', text: '/a/' },
      { kind: 'undefined', text: '{{id}}', name: 'id' },
    ]);
  });

  it('treats dynamic and padded names as defined', () => {
    const tokens = tokenizeVariables('{{ $uuid }}', known);
    expect(tokens).toEqual([{ kind: 'defined', text: '{{ $uuid }}', name: '$uuid' }]);
  });

  it('keeps unterminated or empty placeholders as plain text', () => {
    expect(tokenizeVariables('a {{ho', known)).toEqual([{ kind: 'text', text: 'a {{ho' }]);
    expect(tokenizeVariables('{{}} {{ }}', known).every((token) => token.kind === 'text')).toBe(true);
  });

  it('handles nested opening braces and several per line without losing text', () => {
    const text = '{{{{host}} x {{token}}{{token}}';
    const tokens = tokenizeVariables(text, known);
    expect(tokens.map((token) => token.text).join('')).toBe(text);
    expect(tokens.filter((token) => token.kind === 'defined')).toHaveLength(3);
  });

  it('returns no tokens for empty text', () => {
    expect(tokenizeVariables('', known)).toEqual([]);
    expect(hasVariableTokens(tokenizeVariables('plain', known))).toBe(false);
  });
});

describe('splitTokensAt', () => {
  it('splits a token that spans the offset', () => {
    const { before, after } = splitTokensAt(tokenizeVariables('ab{{host}}cd', known), 5);
    expect(before.map((token) => token.text).join('')).toBe('ab{{h');
    expect(after.map((token) => token.text).join('')).toBe('ost}}cd');
  });
});

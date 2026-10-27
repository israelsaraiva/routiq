import { describe, expect, it } from 'vitest';
import { tokenize } from './syntaxTokens';

const joined = (text: string, language: 'json' | 'xml') =>
  tokenize(text, language)
    .map((token) => token.text)
    .join('');

describe('tokenize', () => {
  it('classifies json tokens', () => {
    const kinds = tokenize('{"a": [1, true, null, "x"]}', 'json')
      .filter((token) => token.kind !== 'plain' && token.kind !== 'punctuation')
      .map((token) => `${token.kind}:${token.text}`);
    expect(kinds).toEqual(['key:"a"', 'number:1', 'literal:true', 'literal:null', 'string:"x"']);
  });

  it('is lossless for json and xml', () => {
    const json = '{\n  "a": "b\\"c", "n": -1.5e3\n}';
    const xml = '<?xml version="1.0"?>\n<a id="1"><!-- c --><b/>text &amp; more</a>';
    expect(joined(json, 'json')).toBe(json);
    expect(joined(xml, 'xml')).toBe(xml);
  });

  it('classifies xml tags, attributes and values', () => {
    const tokens = tokenize('<a id="1">x</a>', 'xml');
    expect(tokens).toContainEqual({ kind: 'tag', text: 'a' });
    expect(tokens).toContainEqual({ kind: 'attribute', text: 'id' });
    expect(tokens).toContainEqual({ kind: 'string', text: '"1"' });
  });

  it('returns plain text unchanged', () => {
    expect(tokenize('hello', 'plain')).toEqual([{ kind: 'plain', text: 'hello' }]);
  });
});

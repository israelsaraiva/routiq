import { describe, expect, it } from 'vitest';
import { ShellSyntaxError, tokenizeShell } from './shellTokenizer';

describe('tokenizeShell', () => {
  it('splits on whitespace and newlines', () => {
    expect(tokenizeShell('curl  -X\tPOST\nurl')).toEqual(['curl', '-X', 'POST', 'url']);
  });

  it('keeps single-quoted content literal', () => {
    expect(tokenizeShell(`-d '{"a": "b c", "q": "\\n"}'`)).toEqual(['-d', '{"a": "b c", "q": "\\n"}']);
  });

  it('handles escapes inside double quotes', () => {
    expect(tokenizeShell(`-d "{\\"a\\": \\"b\\"} \\\\ \\$x \\n"`)).toEqual(['-d', '{"a": "b"} \\ $x \\n']);
  });

  it('removes backslash-newline continuations, also with CRLF', () => {
    expect(tokenizeShell('curl \\\n  -H a \\\r\n  url')).toEqual(['curl', '-H', 'a', 'url']);
    expect(tokenizeShell('"a\\\nb"')).toEqual(['ab']);
  });

  it('escapes characters outside quotes and concatenates adjacent quoted parts', () => {
    expect(tokenizeShell(`a\\ b 'c'"d"e`)).toEqual(['a b', 'cde']);
  });

  it('decodes $\'…\' strings', () => {
    expect(tokenizeShell(`$'line1\\nline2 \\'q\\' \\\\'`)).toEqual([`line1\nline2 'q' \\`]);
  });

  it('keeps empty quoted arguments', () => {
    expect(tokenizeShell(`a '' b`)).toEqual(['a', '', 'b']);
  });

  it('stops at an unquoted pipe, semicolon or &&', () => {
    expect(tokenizeShell('curl url | jq .')).toEqual(['curl', 'url']);
    expect(tokenizeShell('curl url; echo')).toEqual(['curl', 'url']);
    expect(tokenizeShell('curl url && echo')).toEqual(['curl', 'url']);
    expect(tokenizeShell(`curl 'a|b;c&&d'`)).toEqual(['curl', 'a|b;c&&d']);
  });

  it('keeps a single ampersand in an unquoted url', () => {
    expect(tokenizeShell('http://x?a=1&b=2')).toEqual(['http://x?a=1&b=2']);
  });

  it('throws on unterminated quotes', () => {
    expect(() => tokenizeShell(`'abc`)).toThrow(ShellSyntaxError);
    expect(() => tokenizeShell(`"abc`)).toThrow(ShellSyntaxError);
    expect(() => tokenizeShell(`$'abc`)).toThrow(ShellSyntaxError);
  });
});

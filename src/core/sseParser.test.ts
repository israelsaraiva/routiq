import { describe, expect, it } from 'vitest';
import { createSseParser } from './sseParser';

function parseAll(chunks: string[]) {
  const parser = createSseParser();
  return [...chunks.flatMap((chunk) => parser.push(chunk)), ...parser.flush()];
}

describe('createSseParser', () => {
  it('parses a simple data event with the default name', () => {
    expect(parseAll(['data: hello\n\n'])).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('parses event, id and retry fields', () => {
    expect(parseAll(['event: tick\nid: 7\nretry: 2500\ndata: x\n\n'])).toEqual([
      { event: 'tick', data: 'x', id: '7', retry: 2500 },
    ]);
  });

  it('joins multi-line data with newlines', () => {
    expect(parseAll(['data: a\ndata: b\ndata\n\n'])).toEqual([{ event: 'message', data: 'a\nb\n' }]);
  });

  it('handles events split across arbitrary chunk boundaries', () => {
    const wire = 'event: u\ndata: {"a":1}\n\ndata: two\n\n';
    const chunks = wire.split('');
    expect(parseAll(chunks)).toEqual([
      { event: 'u', data: '{"a":1}' },
      { event: 'message', data: 'two' },
    ]);
  });

  it('supports CRLF and CR line endings, including a CRLF split between chunks', () => {
    expect(parseAll(['data: a\r\n\r\ndata: b\r', '\n\r', 'data: c\r\r'])).toEqual([
      { event: 'message', data: 'a' },
      { event: 'message', data: 'b' },
      { event: 'message', data: 'c' },
    ]);
  });

  it('ignores comments, unknown fields and invalid retry values', () => {
    expect(parseAll([': keep-alive\nfoo: bar\nretry: soon\ndata: ok\n\n'])).toEqual([{ event: 'message', data: 'ok' }]);
  });

  it('keeps only one leading space of the value', () => {
    expect(parseAll(['data:  two spaces\ndata:none\n\n'])).toEqual([{ event: 'message', data: ' two spaces\nnone' }]);
  });

  it('emits retry-only events and drops an unterminated trailing event', () => {
    expect(parseAll(['retry: 100\n\ndata: unfinished'])).toEqual([{ event: 'message', data: '', retry: 100 }]);
  });
});

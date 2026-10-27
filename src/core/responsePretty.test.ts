import { describe, expect, it } from 'vitest';
import { isJsonText, prettifyResponseBody } from './responsePretty';

describe('prettifyResponseBody', () => {
  it('keeps integers beyond 2^53 intact', () => {
    expect(prettifyResponseBody('{"id":12345678901234567890,"price":1.10}')).toBe('{\n  "id": 12345678901234567890,\n  "price": 1.10\n}');
  });

  it('formats JSON with a byte order mark and surrounding whitespace', () => {
    expect(prettifyResponseBody('\uFEFF  \n[1,{"a":2}]\n')).toBe('[\n  1,\n  {\n    "a": 2\n  }\n]');
  });

  it('formats JSON regardless of the declared content type', () => {
    expect(prettifyResponseBody('{"a":1}', 'text/plain')).toBe('{\n  "a": 1\n}');
  });

  it('formats each line of NDJSON', () => {
    expect(prettifyResponseBody('{"a":1}\n{"b":[2]}\n')).toBe('{\n  "a": 1\n}\n{\n  "b": [\n    2\n  ]\n}');
  });

  it('returns invalid JSON unchanged', () => {
    expect(prettifyResponseBody('{"a":1,')).toBe('{"a":1,');
    expect(prettifyResponseBody('{"a":1}\n{broken}')).toBe('{"a":1}\n{broken}');
  });

  it('leaves double-encoded JSON and plain text as they are', () => {
    const encoded = '"{\\"a\\":1}"';
    expect(prettifyResponseBody(encoded)).toBe(encoded);
    expect(prettifyResponseBody('hello')).toBe('hello');
  });

  it('indents XML and SOAP envelopes', () => {
    const soap = '<?xml version="1.0"?><s:Envelope xmlns:s="x"><s:Body><Id>7</Id></s:Body></s:Envelope>';
    expect(prettifyResponseBody(soap, 'text/xml')).toBe(
      '<?xml version="1.0"?>\n<s:Envelope xmlns:s="x">\n  <s:Body>\n    <Id>7</Id>\n  </s:Body>\n</s:Envelope>',
    );
  });

  it('indents HTML with void elements and keeps script content verbatim', () => {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><script>if (a<b) {x()}</script></head><body><br><p>Hi</p></body></html>';
    expect(prettifyResponseBody(html, 'text/html')).toBe(
      [
        '<!DOCTYPE html>',
        '<html>',
        '  <head>',
        '    <meta charset="utf-8">',
        '    <script>if (a<b) {x()}</script>',
        '  </head>',
        '  <body>',
        '    <br>',
        '    <p>Hi</p>',
        '  </body>',
        '</html>',
      ].join('\n'),
    );
  });
});

describe('isJsonText', () => {
  it('accepts documents with a byte order mark and NDJSON', () => {
    expect(isJsonText('\uFEFF{"a":1}')).toBe(true);
    expect(isJsonText('{"a":1}\n{"b":2}')).toBe(true);
    expect(isJsonText('{nope')).toBe(false);
  });
});

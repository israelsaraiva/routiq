import { describe, expect, it } from 'vitest';
import { describeJsonError, minifyJson, prettifyJson, validateJson } from './jsonFormat';

describe('prettifyJson', () => {
  it('indents with two spaces and keeps key order and number precision', () => {
    const result = prettifyJson('{"b":1,"2":[1,{"a":null}],"1":12345678901234567890,"e":{},"l":[]}');
    expect(result).toEqual({
      ok: true,
      text: '{\n  "b": 1,\n  "2": [\n    1,\n    {\n      "a": null\n    }\n  ],\n  "1": 12345678901234567890,\n  "e": {},\n  "l": []\n}',
    });
  });

  it('keeps unquoted and quoted placeholders intact', () => {
    const result = prettifyJson('{"id": {{userId}}, "name": "{{name}}", "tags": [{{a}},{{b}}]}');
    expect(result).toEqual({
      ok: true,
      text: '{\n  "id": {{userId}},\n  "name": "{{name}}",\n  "tags": [\n    {{a}},\n    {{b}}\n  ]\n}',
    });
  });

  it('reports line and column of invalid json without producing text', () => {
    const result = prettifyJson('{\n  "a": 1,\n  "b": oops\n}');
    expect(result).toMatchObject({ ok: false, line: 3, column: 8 });
  });

  it('reports truncated input and trailing content', () => {
    expect(prettifyJson('{"a": ')).toMatchObject({ ok: false, message: 'Unexpected end of JSON' });
    expect(prettifyJson('{} x')).toMatchObject({ ok: false, line: 1, column: 4 });
  });
});

describe('minifyJson', () => {
  it('removes whitespace but keeps placeholders and string content', () => {
    expect(minifyJson('{ "a" : {{x}} , "b": "a b", "c": [ 1, 2 ] }')).toEqual({ ok: true, text: '{"a":{{x}},"b":"a b","c":[1,2]}' });
  });
});

describe('validateJson', () => {
  it('treats empty text and placeholders as valid', () => {
    expect(validateJson('  ')).toEqual({ valid: true });
    expect(validateJson('{"a": {{x}}}')).toEqual({ valid: true });
  });

  it('describes the error position', () => {
    const validity = validateJson('{"a" 1}');
    expect(validity).toMatchObject({ valid: false, line: 1, column: 6 });
    if (!validity.valid) {
      expect(describeJsonError(validity)).toBe("Unexpected token '1' at line 1, column 6");
    }
  });
});

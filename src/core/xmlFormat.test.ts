import { describe, expect, it } from 'vitest';
import { prettifyBody } from './bodyFormat';
import { prettifyXml } from './xmlFormat';

describe('prettifyXml', () => {
  it('indents nested elements and keeps leaf text inline', () => {
    expect(prettifyXml('<a><b>one</b><c x="1"/><d><e>t</e></d></a>')).toBe(
      '<a>\n  <b>one</b>\n  <c x="1"/>\n  <d>\n    <e>t</e>\n  </d>\n</a>',
    );
  });

  it('preserves declarations, comments, CDATA and > inside attributes', () => {
    const result = prettifyXml('<?xml version="1.0"?><r a="x>y"><!-- note --><![CDATA[<raw>]]><i/></r>');
    expect(result).toBe('<?xml version="1.0"?>\n<r a="x>y">\n  <!-- note -->\n  <![CDATA[<raw>]]>\n  <i/>\n</r>');
  });

  it('re-indents already formatted xml without changing it', () => {
    const formatted = '<a>\n  <b>1</b>\n</a>';
    expect(prettifyXml(formatted)).toBe(formatted);
  });
});

describe('prettifyBody', () => {
  it('formats plain text bodies that contain json or xml and trims otherwise', () => {
    expect(prettifyBody('text', '{"a":1}')).toEqual({ ok: true, text: '{\n  "a": 1\n}' });
    expect(prettifyBody('text', '<a><b/></a>')).toEqual({ ok: true, text: '<a>\n  <b/>\n</a>' });
    expect(prettifyBody('text', '  hello  \nworld \n')).toEqual({ ok: true, text: 'hello\nworld' });
  });

  it('leaves empty bodies alone', () => {
    expect(prettifyBody('json', '')).toEqual({ ok: true, text: '' });
  });
});

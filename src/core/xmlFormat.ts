const TOKEN_PATTERN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;
const RAW_TEXT_ELEMENT_SOURCE = `<(script|style)\\b(?:[^>"']|"[^"]*"|'[^']*')*>[\\s\\S]*?<\\/\\1\\s*>`;
const WHOLE_RAW_TEXT_ELEMENT = new RegExp(`^${RAW_TEXT_ELEMENT_SOURCE}$`, 'i');
const VOID_HTML_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const INDENT = '  ';

export type MarkupDialect = 'xml' | 'html';

type XmlTokenKind = 'open' | 'close' | 'selfClosing' | 'text' | 'leaf';

interface XmlToken {
  kind: XmlTokenKind;
  text: string;
}

function tagName(raw: string): string {
  return /^<\/?([^\s/>]+)/.exec(raw)?.[1].toLowerCase() ?? '';
}

function classify(raw: string, dialect: MarkupDialect): XmlToken {
  if (dialect === 'html' && WHOLE_RAW_TEXT_ELEMENT.test(raw)) {
    return { kind: 'leaf', text: raw };
  }
  if (!raw.startsWith('<') || raw.startsWith('<![CDATA[')) {
    return { kind: 'text', text: raw };
  }
  if (raw.startsWith('<!') || raw.startsWith('<?')) {
    return { kind: 'leaf', text: raw };
  }
  if (raw.startsWith('</')) {
    return { kind: 'close', text: raw };
  }
  const selfClosing = raw.endsWith('/>') || (dialect === 'html' && VOID_HTML_ELEMENTS.has(tagName(raw)));
  return { kind: selfClosing ? 'selfClosing' : 'open', text: raw };
}

function tokenPattern(dialect: MarkupDialect): RegExp {
  return dialect === 'html' ? new RegExp(`${RAW_TEXT_ELEMENT_SOURCE}|${TOKEN_PATTERN.source}`, 'gi') : TOKEN_PATTERN;
}

function tokenize(xml: string, dialect: MarkupDialect): XmlToken[] {
  return (xml.match(tokenPattern(dialect)) ?? [])
    .map((raw) => classify(raw, dialect))
    .map((token) => (token.kind === 'text' && !token.text.startsWith('<') ? { ...token, text: token.text.trim() } : token))
    .filter((token) => token.text !== '');
}

function isInlineElement(tokens: XmlToken[], index: number): boolean {
  return tokens[index].kind === 'open' && tokens[index + 1]?.kind === 'text' && tokens[index + 2]?.kind === 'close';
}

export function prettifyXml(xml: string): string {
  return prettifyMarkup(xml, 'xml');
}

export function prettifyHtml(html: string): string {
  return prettifyMarkup(html, 'html');
}

function prettifyMarkup(markup: string, dialect: MarkupDialect): string {
  const tokens = tokenize(markup, dialect);
  const lines: string[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind === 'close') {
      depth = Math.max(0, depth - 1);
    }
    if (isInlineElement(tokens, index)) {
      lines.push(INDENT.repeat(depth) + tokens[index].text + tokens[index + 1].text + tokens[index + 2].text);
      index += 2;
      continue;
    }
    lines.push(INDENT.repeat(depth) + token.text);
    if (token.kind === 'open') {
      depth++;
    }
  }
  return lines.join('\n');
}

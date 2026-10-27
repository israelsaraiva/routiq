const TOKEN_PATTERN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;
const INDENT = '  ';

type XmlTokenKind = 'open' | 'close' | 'selfClosing' | 'text' | 'leaf';

interface XmlToken {
  kind: XmlTokenKind;
  text: string;
}

function classify(raw: string): XmlToken {
  if (!raw.startsWith('<') || raw.startsWith('<![CDATA[')) {
    return { kind: 'text', text: raw };
  }
  if (raw.startsWith('<!') || raw.startsWith('<?')) {
    return { kind: 'leaf', text: raw };
  }
  if (raw.startsWith('</')) {
    return { kind: 'close', text: raw };
  }
  return { kind: raw.endsWith('/>') ? 'selfClosing' : 'open', text: raw };
}

function tokenize(xml: string): XmlToken[] {
  return (xml.match(TOKEN_PATTERN) ?? [])
    .map(classify)
    .map((token) => (token.kind === 'text' && !token.text.startsWith('<') ? { ...token, text: token.text.trim() } : token))
    .filter((token) => token.text !== '');
}

function isInlineElement(tokens: XmlToken[], index: number): boolean {
  return tokens[index].kind === 'open' && tokens[index + 1]?.kind === 'text' && tokens[index + 2]?.kind === 'close';
}

export function prettifyXml(xml: string): string {
  const tokens = tokenize(xml);
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

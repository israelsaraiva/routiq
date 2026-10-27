export type TokenKind = 'key' | 'string' | 'number' | 'literal' | 'punctuation' | 'tag' | 'attribute' | 'comment' | 'plain';

export interface SyntaxToken {
  kind: TokenKind;
  text: string;
}

export type SyntaxLanguage = 'json' | 'xml' | 'plain';

const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:]/y;
const MARKUP_TOKEN = /<!--[\s\S]*?-->|<[^>]*>|[^<]+|</y;
const ATTRIBUTE_PART = /("[^"]*"|'[^']*')|([^\s=<>/"']+)|(\s+)|([=/<>])/y;

export function tokenize(text: string, language: SyntaxLanguage): SyntaxToken[] {
  if (language === 'json') {
    return tokenizeJson(text);
  }
  return language === 'xml' ? tokenizeMarkup(text) : [{ kind: 'plain', text }];
}

function tokenizeJson(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let position = 0;
  while (position < text.length) {
    JSON_TOKEN.lastIndex = position;
    const match = JSON_TOKEN.exec(text);
    if (match) {
      tokens.push({ kind: jsonKind(match[0], text, JSON_TOKEN.lastIndex), text: match[0] });
      position = JSON_TOKEN.lastIndex;
    } else {
      position = appendPlainUntilNextMatch(tokens, text, position);
    }
  }
  return tokens;
}

function appendPlainUntilNextMatch(tokens: SyntaxToken[], text: string, from: number): number {
  const rest = text.slice(from);
  const next = rest.slice(1).search(/["\-\d{}[\],:tfn]/);
  const end = next < 0 ? text.length : from + 1 + next;
  tokens.push({ kind: 'plain', text: text.slice(from, end) });
  return end;
}

function jsonKind(token: string, text: string, end: number): TokenKind {
  if (token.startsWith('"')) {
    return /^\s*:/.test(text.slice(end, end + 64)) ? 'key' : 'string';
  }
  if (/^[{}[\],:]$/.test(token)) {
    return 'punctuation';
  }
  return /^-?\d/.test(token) ? 'number' : 'literal';
}

function tokenizeMarkup(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  MARKUP_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (MARKUP_TOKEN.lastIndex < text.length && (match = MARKUP_TOKEN.exec(text))) {
    tokens.push(...markupTokens(match[0]));
  }
  return tokens;
}

function markupTokens(chunk: string): SyntaxToken[] {
  if (chunk.startsWith('<!--')) {
    return [{ kind: 'comment', text: chunk }];
  }
  if (!chunk.startsWith('<') || chunk === '<') {
    return [{ kind: 'plain', text: chunk }];
  }
  return tagTokens(chunk);
}

function tagTokens(tag: string): SyntaxToken[] {
  const opening = /^<[/!?]?/.exec(tag)?.[0] ?? '<';
  const name = /^[^\s/>]*/.exec(tag.slice(opening.length))?.[0] ?? '';
  const tokens: SyntaxToken[] = [
    { kind: 'punctuation', text: opening },
    { kind: 'tag', text: name },
  ];
  tokens.push(...attributeTokens(tag.slice(opening.length + name.length)));
  return tokens.filter((token) => token.text.length > 0);
}

function attributeTokens(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  ATTRIBUTE_PART.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (ATTRIBUTE_PART.lastIndex < text.length && (match = ATTRIBUTE_PART.exec(text))) {
    tokens.push({ kind: attributeKind(match), text: match[0] });
  }
  return tokens;
}

function attributeKind(match: RegExpExecArray): TokenKind {
  if (match[1]) {
    return 'string';
  }
  if (match[2]) {
    return 'attribute';
  }
  return match[3] ? 'plain' : 'punctuation';
}

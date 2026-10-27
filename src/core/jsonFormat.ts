export type FormatResult = { ok: true; text: string } | { ok: false; message: string; line: number; column: number };

export type JsonValidity = { valid: true } | { valid: false; message: string; line: number; column: number };

type JsonNode =
  | { kind: 'scalar'; raw: string }
  | { kind: 'array'; items: JsonNode[] }
  | { kind: 'object'; members: Array<{ key: string; value: JsonNode }> };

type Layout = { indent: string; newline: string; colon: string };

const PRETTY_LAYOUT: Layout = { indent: '  ', newline: '\n', colon: ': ' };
const MINIFIED_LAYOUT: Layout = { indent: '', newline: '', colon: ':' };
const LITERAL_PATTERN = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/;
const PLACEHOLDER_PATTERN = /^\{\{[^{}\n]*\}\}/;
const WHITESPACE_PATTERN = /\s/;

class JsonSyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

class JsonParser {
  private offset = 0;

  constructor(private readonly text: string) {}

  parseDocument(): JsonNode {
    const node = this.parseValue();
    this.skipWhitespace();
    if (this.offset < this.text.length) {
      throw this.unexpected();
    }
    return node;
  }

  private parseValue(): JsonNode {
    this.skipWhitespace();
    const char = this.text[this.offset];
    if (this.atPlaceholder()) {
      return { kind: 'scalar', raw: this.readPlaceholder() };
    }
    if (char === '{') {
      return this.parseObject();
    }
    if (char === '[') {
      return this.parseArray();
    }
    if (char === '"') {
      return { kind: 'scalar', raw: this.readString() };
    }
    return { kind: 'scalar', raw: this.readLiteral() };
  }

  private parseObject(): JsonNode {
    this.offset++;
    const members: Array<{ key: string; value: JsonNode }> = [];
    this.skipWhitespace();
    if (this.consume('}')) {
      return { kind: 'object', members };
    }
    do {
      this.skipWhitespace();
      const key = this.text[this.offset] === '"' ? this.readString() : this.readPlaceholder();
      this.skipWhitespace();
      this.expect(':');
      members.push({ key, value: this.parseValue() });
      this.skipWhitespace();
    } while (this.consume(','));
    this.expect('}');
    return { kind: 'object', members };
  }

  private parseArray(): JsonNode {
    this.offset++;
    const items: JsonNode[] = [];
    this.skipWhitespace();
    if (this.consume(']')) {
      return { kind: 'array', items };
    }
    do {
      items.push(this.parseValue());
      this.skipWhitespace();
    } while (this.consume(','));
    this.expect(']');
    return { kind: 'array', items };
  }

  private readString(): string {
    const start = this.offset;
    this.offset++;
    while (this.offset < this.text.length) {
      const char = this.text[this.offset];
      if (char === '"') {
        this.offset++;
        return this.text.slice(start, this.offset);
      }
      if (char === '\n') {
        break;
      }
      this.offset += char === '\\' ? 2 : 1;
    }
    throw new JsonSyntaxError('Unterminated string', start);
  }

  private readPlaceholder(): string {
    const match = PLACEHOLDER_PATTERN.exec(this.text.slice(this.offset));
    if (!match) {
      throw this.unexpected();
    }
    this.offset += match[0].length;
    return match[0];
  }

  private atPlaceholder(): boolean {
    return PLACEHOLDER_PATTERN.test(this.text.slice(this.offset));
  }

  private readLiteral(): string {
    const match = LITERAL_PATTERN.exec(this.text.slice(this.offset));
    if (!match) {
      throw this.unexpected();
    }
    this.offset += match[0].length;
    return match[0];
  }

  private consume(char: string): boolean {
    if (this.text[this.offset] === char) {
      this.offset++;
      return true;
    }
    return false;
  }

  private expect(char: string): void {
    if (!this.consume(char)) {
      throw this.unexpected();
    }
  }

  private skipWhitespace(): void {
    while (this.offset < this.text.length && WHITESPACE_PATTERN.test(this.text[this.offset])) {
      this.offset++;
    }
  }

  private unexpected(): JsonSyntaxError {
    if (this.offset >= this.text.length) {
      return new JsonSyntaxError('Unexpected end of JSON', this.offset);
    }
    return new JsonSyntaxError(`Unexpected token '${this.text[this.offset]}'`, this.offset);
  }
}

function serialize(node: JsonNode, layout: Layout, depth: number): string {
  if (node.kind === 'scalar') {
    return node.raw;
  }
  const children =
    node.kind === 'array'
      ? node.items.map((item) => serialize(item, layout, depth + 1))
      : node.members.map((member) => `${member.key}${layout.colon}${serialize(member.value, layout, depth + 1)}`);
  const [open, close] = node.kind === 'array' ? ['[', ']'] : ['{', '}'];
  if (children.length === 0) {
    return open + close;
  }
  const inner = layout.indent.repeat(depth + 1);
  const outer = layout.indent.repeat(depth);
  return `${open}${layout.newline}${children.map((child) => inner + child).join(`,${layout.newline}`)}${layout.newline}${outer}${close}`;
}

function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
}

function reformat(text: string, layout: Layout): FormatResult {
  try {
    const node = new JsonParser(text).parseDocument();
    return { ok: true, text: serialize(node, layout, 0) };
  } catch (error) {
    if (!(error instanceof JsonSyntaxError)) {
      throw error;
    }
    return { ok: false, message: error.message, ...lineAndColumn(text, error.offset) };
  }
}

export function prettifyJson(text: string): FormatResult {
  return reformat(text, PRETTY_LAYOUT);
}

export function minifyJson(text: string): FormatResult {
  return reformat(text, MINIFIED_LAYOUT);
}

export function describeJsonError(error: { message: string; line: number; column: number }): string {
  return `${error.message} at line ${error.line}, column ${error.column}`;
}

export function validateJson(text: string): JsonValidity {
  if (text.trim() === '') {
    return { valid: true };
  }
  const result = prettifyJson(text);
  return result.ok ? { valid: true } : { valid: false, message: result.message, line: result.line, column: result.column };
}

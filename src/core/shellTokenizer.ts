const ANSI_C_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
const DOUBLE_QUOTE_ESCAPABLE = new Set(['"', '\\', '$', '`']);
const LINE_BREAK = /^\r?\n/;

export class ShellSyntaxError extends Error {}

class Scanner {
  position = 0;
  constructor(readonly text: string) {}

  get done(): boolean {
    return this.position >= this.text.length;
  }

  peek(offset = 0): string {
    return this.text[this.position + offset] ?? '';
  }

  skipLineContinuation(): boolean {
    const match = LINE_BREAK.exec(this.text.slice(this.position + 1, this.position + 3));
    if (this.peek() !== '\\' || !match) {
      return false;
    }
    this.position += 1 + match[0].length;
    return true;
  }
}

function readSingleQuoted(scanner: Scanner): string {
  const end = scanner.text.indexOf("'", scanner.position);
  if (end === -1) {
    throw new ShellSyntaxError('Unterminated single quote');
  }
  const value = scanner.text.slice(scanner.position, end);
  scanner.position = end + 1;
  return value;
}

function readDoubleQuoted(scanner: Scanner): string {
  let value = '';
  while (!scanner.done) {
    const char = scanner.peek();
    if (char === '"') {
      scanner.position++;
      return value;
    }
    if (char === '\\' && scanner.skipLineContinuation()) {
      continue;
    }
    if (char === '\\' && DOUBLE_QUOTE_ESCAPABLE.has(scanner.peek(1))) {
      value += scanner.peek(1);
      scanner.position += 2;
      continue;
    }
    value += char;
    scanner.position++;
  }
  throw new ShellSyntaxError('Unterminated double quote');
}

function readAnsiCQuoted(scanner: Scanner): string {
  let value = '';
  while (!scanner.done) {
    const char = scanner.peek();
    scanner.position++;
    if (char === "'") {
      return value;
    }
    if (char === '\\' && !scanner.done) {
      const escaped = scanner.peek();
      scanner.position++;
      value += ANSI_C_ESCAPES[escaped] ?? `\\${escaped}`;
    } else {
      value += char;
    }
  }
  throw new ShellSyntaxError('Unterminated $\'…\' quote');
}

function isCommandTerminator(scanner: Scanner): boolean {
  const char = scanner.peek();
  return char === '|' || char === ';' || (char === '&' && scanner.peek(1) === '&');
}

export function tokenizeShell(input: string): string[] {
  const scanner = new Scanner(input);
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  const endToken = () => {
    if (inToken) {
      tokens.push(current);
    }
    current = '';
    inToken = false;
  };

  while (!scanner.done) {
    const char = scanner.peek();
    if (/\s/.test(char)) {
      endToken();
      scanner.position++;
    } else if (isCommandTerminator(scanner)) {
      break;
    } else if (char === '\\' && scanner.skipLineContinuation()) {
      continue;
    } else if (char === '\\') {
      inToken = true;
      current += scanner.peek(1);
      scanner.position += 2;
    } else if (char === "'") {
      inToken = true;
      scanner.position++;
      current += readSingleQuoted(scanner);
    } else if (char === '"') {
      inToken = true;
      scanner.position++;
      current += readDoubleQuoted(scanner);
    } else if (char === '$' && scanner.peek(1) === "'") {
      inToken = true;
      scanner.position += 2;
      current += readAnsiCQuoted(scanner);
    } else {
      inToken = true;
      current += char;
      scanner.position++;
    }
  }
  endToken();
  return tokens;
}

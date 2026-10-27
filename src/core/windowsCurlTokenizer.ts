import { ShellSyntaxError, tokenizeShell } from './shellTokenizer';

const CMD_STYLE = /\^"|\^\r?\n/;
const POWERSHELL_CONTINUATION = /`\r?\n/;
const WINDOWS_EXECUTABLE = /^(\$\s*)?curl\.exe(\s|$)/i;
const POWERSHELL_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v' };
const LINE_BREAK = /^\r?\n/;

function unescapeCmdCarets(text: string): string {
  let result = '';
  let position = 0;
  while (position < text.length) {
    const lineBreak = text[position] === '^' ? LINE_BREAK.exec(text.slice(position + 1, position + 3)) : null;
    if (lineBreak) {
      result += ' ';
      position += 1 + lineBreak[0].length;
    } else if (text[position] === '^' && position + 1 < text.length) {
      result += text[position + 1];
      position += 2;
    } else {
      result += text[position];
      position++;
    }
  }
  return result;
}

function isPowerShellStyle(text: string): boolean {
  return POWERSHELL_CONTINUATION.test(text) || WINDOWS_EXECUTABLE.test(text);
}

class PowerShellScanner {
  position = 0;
  constructor(readonly text: string) {}

  get done(): boolean {
    return this.position >= this.text.length;
  }

  peek(offset = 0): string {
    return this.text[this.position + offset] ?? '';
  }
}

function readSingleQuoted(scanner: PowerShellScanner): string {
  let value = '';
  while (!scanner.done) {
    const char = scanner.peek();
    scanner.position++;
    if (char === "'" && scanner.peek() === "'") {
      value += "'";
      scanner.position++;
    } else if (char === "'") {
      return value;
    } else {
      value += char;
    }
  }
  throw new ShellSyntaxError('Unterminated single quote');
}

function readBacktickEscape(scanner: PowerShellScanner): string {
  const escaped = scanner.peek();
  scanner.position++;
  return POWERSHELL_ESCAPES[escaped] ?? escaped;
}

function readDoubleQuoted(scanner: PowerShellScanner): string {
  let value = '';
  while (!scanner.done) {
    const char = scanner.peek();
    scanner.position++;
    if (char === '"' && scanner.peek() === '"') {
      value += '"';
      scanner.position++;
    } else if (char === '"') {
      return value;
    } else if (char === '`' && !scanner.done) {
      value += readBacktickEscape(scanner);
    } else {
      value += char;
    }
  }
  throw new ShellSyntaxError('Unterminated double quote');
}

function isPowerShellTerminator(scanner: PowerShellScanner): boolean {
  const char = scanner.peek();
  return char === '|' || char === ';' || (char === '&' && scanner.peek(1) === '&');
}

function skipBacktickLineBreak(scanner: PowerShellScanner): boolean {
  const lineBreak = scanner.peek() === '`' ? LINE_BREAK.exec(scanner.text.slice(scanner.position + 1, scanner.position + 3)) : null;
  if (!lineBreak) {
    return false;
  }
  scanner.position += 1 + lineBreak[0].length;
  return true;
}

function tokenizePowerShell(input: string): string[] {
  const scanner = new PowerShellScanner(input);
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
    } else if (isPowerShellTerminator(scanner)) {
      break;
    } else if (skipBacktickLineBreak(scanner)) {
      endToken();
    } else {
      inToken = true;
      scanner.position++;
      if (char === "'") {
        current += readSingleQuoted(scanner);
      } else if (char === '"') {
        current += readDoubleQuoted(scanner);
      } else if (char === '`' && !scanner.done) {
        current += readBacktickEscape(scanner);
      } else {
        current += char;
      }
    }
  }
  endToken();
  return tokens;
}

export function tokenizeCurlCommand(command: string): string[] {
  const text = command.trim();
  if (CMD_STYLE.test(text)) {
    return tokenizeShell(unescapeCmdCarets(text));
  }
  return isPowerShellStyle(text) ? tokenizePowerShell(text) : tokenizeShell(text);
}

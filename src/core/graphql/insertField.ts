export interface TextEdit {
  text: string;
  caret: number;
}

const INDENT = '  ';

function lineIndentBefore(text: string, caret: number): string {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart, caret))?.[0] ?? '';
}

function separatorBefore(text: string, caret: number): string {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  const lineBeforeCaret = text.slice(lineStart, caret);
  if (lineBeforeCaret.trim() === '') {
    return '';
  }
  return /\s$/.test(lineBeforeCaret) ? '' : `\n${lineIndentBefore(text, caret)}${INDENT}`;
}

export function insertField(text: string, caret: number, fieldName: string, operationKeyword: string): TextEdit {
  if (text.trim() === '') {
    const created = `${operationKeyword} {\n${INDENT}${fieldName}\n}`;
    return { text: created, caret: created.length - 2 };
  }
  const safeCaret = Math.min(Math.max(caret, 0), text.length);
  const insertion = `${separatorBefore(text, safeCaret)}${fieldName}`;
  return { text: `${text.slice(0, safeCaret)}${insertion}${text.slice(safeCaret)}`, caret: safeCaret + insertion.length };
}

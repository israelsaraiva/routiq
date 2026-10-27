import { prettifyJson } from './jsonFormat';
import { prettifyHtml, prettifyXml } from './xmlFormat';

const BYTE_ORDER_MARK = '\uFEFF';
const HTML_DOCUMENT_START = /^<(?:!doctype\s+html|html[\s>])/i;

export function stripByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
}

function prettifyJsonDocument(text: string): string | undefined {
  const result = prettifyJson(text);
  return result.ok ? result.text : undefined;
}

function splitJsonLines(text: string): string[] | undefined {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const isContainer = (line: string) => /^\s*[{[]/.test(line);
  return lines.length > 1 && lines.every(isContainer) ? lines : undefined;
}

function prettifyJsonLines(text: string): string | undefined {
  const lines = splitJsonLines(text);
  const formatted = lines?.map(prettifyJsonDocument);
  return formatted?.every((line) => line !== undefined) ? formatted.join('\n') : undefined;
}

function isHtml(text: string, contentType: string): boolean {
  return /html/i.test(contentType) || HTML_DOCUMENT_START.test(text);
}

export function prettifyResponseBody(body: string, contentType = ''): string {
  const text = stripByteOrderMark(body).trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    return prettifyJsonDocument(text) ?? prettifyJsonLines(text) ?? body;
  }
  if (text.startsWith('<')) {
    return isHtml(text, contentType) ? prettifyHtml(text) : prettifyXml(text);
  }
  return body;
}

export function isJsonText(body: string): boolean {
  const text = stripByteOrderMark(body).trim();
  return prettifyJsonDocument(text) !== undefined || prettifyJsonLines(text) !== undefined;
}

import { isJsonText } from './responsePretty';
import { SyntaxLanguage } from './syntaxTokens';

const EXTENSIONS_BY_MIME: Record<string, string> = {
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'text/css': 'css',
  'text/csv': 'csv',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'text/plain': 'txt',
};

export function findContentType(headers: Array<[string, string]>): string {
  const header = headers.find(([name]) => name.toLowerCase() === 'content-type');
  return header ? header[1] : '';
}

function mimeType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

export function extensionForContentType(contentType: string): string {
  const mime = mimeType(contentType);
  if (EXTENSIONS_BY_MIME[mime]) {
    return EXTENSIONS_BY_MIME[mime];
  }
  if (mime.endsWith('+json')) {
    return 'json';
  }
  return mime.endsWith('+xml') ? 'xml' : 'txt';
}

export function languageForBody(contentType: string, body: string): SyntaxLanguage {
  const extension = extensionForContentType(contentType);
  if (extension === 'json' || extension === 'xml' || extension === 'html') {
    return extension === 'json' ? 'json' : 'xml';
  }
  return sniffLanguage(body);
}

function sniffLanguage(body: string): SyntaxLanguage {
  const start = body.trimStart()[0];
  if (start === '{' || start === '[') {
    return isJsonText(body) ? 'json' : 'plain';
  }
  return start === '<' ? 'xml' : 'plain';
}

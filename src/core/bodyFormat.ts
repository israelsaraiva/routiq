import { BodyType } from '../shared/types';
import { FormatResult, prettifyJson } from './jsonFormat';
import { prettifyXml } from './xmlFormat';

export type FormattableBodyType = Extract<BodyType, 'json' | 'xml' | 'text'>;

function prettifyPlainText(text: string): FormatResult {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const json = prettifyJson(trimmed);
    if (json.ok) {
      return json;
    }
  }
  if (trimmed.startsWith('<')) {
    return { ok: true, text: prettifyXml(trimmed) };
  }
  return { ok: true, text: trimmed.replace(/[ \t]+$/gm, '') };
}

export function prettifyBody(type: FormattableBodyType, text: string): FormatResult {
  if (text.trim() === '') {
    return { ok: true, text };
  }
  if (type === 'json') {
    return prettifyJson(text);
  }
  if (type === 'xml') {
    return { ok: true, text: prettifyXml(text) };
  }
  return prettifyPlainText(text);
}

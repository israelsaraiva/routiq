import { VariableSuggestion } from '../shared/types';
import { fuzzyFilter } from './fuzzy';

export const COMMON_HEADER_NAMES = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Disposition',
  'Content-Encoding',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-Requested-With',
  'If-Match',
  'If-None-Match',
  'If-Modified-Since',
  'Range',
  'Host',
];

const MAX_SUGGESTIONS = 12;

export interface PlaceholderTrigger {
  start: number;
  query: string;
}

export interface TextEdit {
  text: string;
  caret: number;
}

export function findPlaceholderTrigger(text: string, caret: number): PlaceholderTrigger | undefined {
  if (caret < 2) {
    return undefined;
  }
  const start = text.lastIndexOf('{{', caret - 2);
  if (start === -1) {
    return undefined;
  }
  const query = text.slice(start + 2, caret);
  return /[\s{}]/.test(query) ? undefined : { start, query };
}

export function filterVariableSuggestions(suggestions: VariableSuggestion[], query: string): VariableSuggestion[] {
  return fuzzyFilter(suggestions, query, (suggestion) => suggestion.name).slice(0, MAX_SUGGESTIONS);
}

export function filterHeaderNames(query: string, excluded: string[] = []): string[] {
  const remaining = COMMON_HEADER_NAMES.filter((name) => !excluded.some((used) => used.toLowerCase() === name.toLowerCase()));
  const matches = fuzzyFilter(remaining, query, (name) => name);
  return matches.filter((name) => name.toLowerCase() !== query.toLowerCase()).slice(0, MAX_SUGGESTIONS);
}

export function insertVariable(text: string, caret: number, trigger: PlaceholderTrigger, name: string): TextEdit {
  const closing = text.startsWith('}}', caret) ? 2 : 0;
  const placeholder = `{{${name}}}`;
  return { text: text.slice(0, trigger.start) + placeholder + text.slice(caret + closing), caret: trigger.start + placeholder.length };
}

export interface RangeReplacement {
  start: number;
  end: number;
  insert: string;
}

export function minimalReplacement(before: string, after: string): RangeReplacement {
  const limit = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < limit && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (suffix < limit - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
    suffix += 1;
  }
  return { start: prefix, end: before.length - suffix, insert: after.slice(prefix, after.length - suffix) };
}

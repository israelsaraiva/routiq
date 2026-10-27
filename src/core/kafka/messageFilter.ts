import { KafkaFilterScope, KafkaMessageFilter } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { evaluateJsonPath } from '../jsonPath';
import { parseMessage } from './messageParsing';

export const MAX_REGEX_LENGTH = 200;
const MAX_SEARCHED_CHARACTERS = 200_000;
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)\s*[+*{]/;
const ERROR_WORDS = /\b(error|exception|failed|failure|fatal)\b/i;
const ERROR_LEVELS = new Set(['error', 'fatal', 'critical', 'severe']);
const CONDITION = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

export const EMPTY_FILTER: KafkaMessageFilter = {
  text: '',
  regex: false,
  caseSensitive: false,
  scope: 'all',
  jsonPath: '',
  headerKey: '',
  headerValue: '',
  partition: null,
  fromTime: null,
  toTime: null,
  errorsOnly: false,
};

export interface CompiledFilter {
  matches: (message: KafkaMessage) => boolean;
  error?: string;
}

type Predicate = (message: KafkaMessage) => boolean;
type TextMatcher = (text: string) => boolean;

const parsedValues = new WeakMap<KafkaMessage, unknown>();

function parsedValue(message: KafkaMessage): unknown {
  if (!parsedValues.has(message)) {
    parsedValues.set(message, tryParseJson(message.value));
  }
  return parsedValues.get(message);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function isFilterActive(filter: KafkaMessageFilter): boolean {
  return JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER);
}

export function normalizeFilter(stored: unknown): KafkaMessageFilter {
  const candidate = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<KafkaMessageFilter>;
  const scopes: KafkaFilterScope[] = ['all', 'key', 'value', 'headers'];
  const numberOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    text: text(candidate.text),
    regex: candidate.regex === true,
    caseSensitive: candidate.caseSensitive === true,
    scope: scopes.includes(candidate.scope as KafkaFilterScope) ? (candidate.scope as KafkaFilterScope) : 'all',
    jsonPath: text(candidate.jsonPath),
    headerKey: text(candidate.headerKey),
    headerValue: text(candidate.headerValue),
    partition: numberOrNull(candidate.partition),
    fromTime: numberOrNull(candidate.fromTime),
    toTime: numberOrNull(candidate.toTime),
    errorsOnly: candidate.errorsOnly === true,
  };
}

export function validateRegex(pattern: string): string | undefined {
  if (pattern.length > MAX_REGEX_LENGTH) {
    return `Regex is longer than ${MAX_REGEX_LENGTH} characters`;
  }
  if (NESTED_QUANTIFIER.test(pattern)) {
    return 'Regex looks too expensive (nested quantifiers)';
  }
  try {
    new RegExp(pattern);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid regex';
  }
}

function buildTextMatcher(text: string, regex: boolean, caseSensitive: boolean): { matcher?: TextMatcher; error?: string } {
  if (!text) {
    return {};
  }
  if (regex) {
    const error = validateRegex(text);
    const pattern = error ? undefined : new RegExp(text, caseSensitive ? '' : 'i');
    return { matcher: pattern && ((candidate) => pattern.test(candidate.slice(0, MAX_SEARCHED_CHARACTERS))), error };
  }
  const needle = caseSensitive ? text : text.toLowerCase();
  return { matcher: (candidate) => (caseSensitive ? candidate : candidate.toLowerCase()).includes(needle) };
}

function scopeFields(message: KafkaMessage, scope: KafkaFilterScope): string[] {
  const headers = message.headers ? Object.entries(message.headers).flatMap(([name, value]) => [name, value]) : [];
  const key = message.key ?? '';
  switch (scope) {
    case 'key':
      return [key];
    case 'value':
      return [message.value];
    case 'headers':
      return headers;
    case 'all':
      return [message.value, message.topic, message.flowId, key, ...headers];
  }
}

function parseLiteral(text: string): unknown {
  const trimmed = text.trim();
  const quoted = /^(["'])(.*)\1$/.exec(trimmed);
  if (quoted) {
    return quoted[2];
  }
  if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
    return JSON.parse(trimmed);
  }
  return trimmed !== '' && !Number.isNaN(Number(trimmed)) ? Number(trimmed) : trimmed;
}

function compare(actual: unknown, operator: string, expected: unknown): boolean {
  const comparable = typeof actual === typeof expected;
  switch (operator) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return comparable && (actual as number) > (expected as number);
    case '<':
      return comparable && (actual as number) < (expected as number);
    case '>=':
      return comparable && (actual as number) >= (expected as number);
    default:
      return comparable && (actual as number) <= (expected as number);
  }
}

function buildJsonPathPredicate(expression: string): Predicate | undefined {
  const text = expression.trim();
  if (!text) {
    return undefined;
  }
  const condition = CONDITION.exec(text);
  const path = condition ? condition[1] : text;
  const expected = condition ? parseLiteral(condition[3]) : undefined;
  return (message) => {
    const document = parsedValue(message);
    const result = document === undefined ? undefined : evaluateJsonPath(path, document);
    if (!result?.ok) {
      return false;
    }
    if (!condition) {
      return true;
    }
    const candidates = Array.isArray(result.value) && /\*/.test(path) ? result.value : [result.value];
    return candidates.some((candidate) => compare(candidate, condition[2], expected));
  };
}

export function validateJsonPathCondition(expression: string): string | undefined {
  const path = CONDITION.exec(expression.trim())?.[1] ?? expression.trim();
  const probe = path ? evaluateJsonPath(path, {}) : undefined;
  return probe && !probe.ok && probe.error === 'Invalid path' ? 'Invalid JSON path' : undefined;
}

export function isErrorMessage(message: KafkaMessage): boolean {
  if (message.level && ERROR_LEVELS.has(message.level.toLowerCase())) {
    return true;
  }
  const parsed = parseMessage(message.value);
  return parsed.success === false || parsed.errorMessage !== undefined || ERROR_WORDS.test(message.value.slice(0, MAX_SEARCHED_CHARACTERS));
}

function buildHeaderPredicate(filter: KafkaMessageFilter): Predicate | undefined {
  const name = filter.headerKey.trim().toLowerCase();
  if (!name) {
    return undefined;
  }
  const wanted = filter.headerValue.trim().toLowerCase();
  return (message) =>
    Object.entries(message.headers ?? {}).some(([key, value]) => key.toLowerCase() === name && (!wanted || value.toLowerCase().includes(wanted)));
}

function buildTimePredicate(filter: KafkaMessageFilter): Predicate | undefined {
  const { fromTime, toTime } = filter;
  return fromTime === null && toTime === null
    ? undefined
    : (message) => (fromTime === null || message.timestamp >= fromTime) && (toTime === null || message.timestamp <= toTime);
}

export function compileFilter(filter: KafkaMessageFilter): CompiledFilter {
  const { matcher, error } = buildTextMatcher(filter.text, filter.regex, filter.caseSensitive);
  const predicates: Array<Predicate | undefined> = [
    matcher && ((message) => scopeFields(message, filter.scope).some(matcher)),
    buildJsonPathPredicate(filter.jsonPath),
    buildHeaderPredicate(filter),
    filter.partition === null ? undefined : (message) => message.partition === filter.partition,
    buildTimePredicate(filter),
    filter.errorsOnly ? isErrorMessage : undefined,
  ];
  const active = predicates.filter((predicate): predicate is Predicate => predicate !== undefined);
  return { matches: (message) => active.every((predicate) => predicate(message)), error };
}

export function filterByStructuredFilter(messages: KafkaMessage[], filter: KafkaMessageFilter): KafkaMessage[] {
  const { matches, error } = compileFilter(filter);
  return error ? messages : messages.filter(matches);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTimeLocal(timestamp: number | null): string {
  if (timestamp === null) {
    return '';
  }
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDateTimeLocal(text: string): number | null {
  const parsed = text ? new Date(text).getTime() : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

export function advancedFilterCount(filter: KafkaMessageFilter): number {
  const active = [filter.jsonPath, filter.headerKey, filter.partition !== null, filter.fromTime !== null, filter.toTime !== null, filter.errorsOnly];
  return active.filter(Boolean).length;
}

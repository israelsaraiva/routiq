export interface MatcherVerdict {
  pass: boolean;
  message: string;
}

type Matcher = (actual: unknown, expected: unknown[]) => boolean;

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (!isObjectLike(left) || !isObjectLike(right) || Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => hasOwn(right, key) && deepEqual(left[key], right[key]));
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isOrderable(value: unknown): value is number | bigint | string {
  return typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string';
}

function compare(actual: unknown, expected: unknown[], test: (difference: number) => boolean): boolean {
  const [limit] = expected;
  if (!isOrderable(actual) || typeof actual !== typeof limit) {
    return false;
  }
  return test(actual < (limit as typeof actual) ? -1 : actual > (limit as typeof actual) ? 1 : 0);
}

function lengthOf(value: unknown): number | undefined {
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length;
  }
  return undefined;
}

function contains(actual: unknown, expected: unknown[]): boolean {
  const [item] = expected;
  if (typeof actual === 'string') {
    return typeof item === 'string' && actual.includes(item);
  }
  return Array.isArray(actual) && actual.some((element) => deepEqual(element, item));
}

function matchesPattern(actual: unknown, expected: unknown[]): boolean {
  const [pattern] = expected;
  if (typeof actual !== 'string') {
    return false;
  }
  return typeof pattern === 'string' ? actual.includes(pattern) : testRegExpLike(pattern, actual);
}

function testRegExpLike(pattern: unknown, text: string): boolean {
  if (!isObjectLike(pattern) || typeof pattern.source !== 'string') {
    return false;
  }
  const flags = typeof pattern.flags === 'string' ? pattern.flags.replace(/[gy]/g, '') : '';
  return new RegExp(pattern.source, flags).test(text);
}

function hasProperty(actual: unknown, expected: unknown[]): boolean {
  const [path, ...rest] = expected;
  if (typeof path !== 'string' || actual === null || actual === undefined) {
    return false;
  }
  const value = readPath(actual, path);
  return value.found && (rest.length === 0 || deepEqual(value.value, rest[0]));
}

function readPath(root: unknown, path: string): { found: boolean; value?: unknown } {
  let current = root;
  for (const segment of path.split('.').filter(Boolean)) {
    if (!isObjectLike(current) || !hasOwn(current, segment)) {
      return { found: false };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

const MATCHERS: Record<string, Matcher> = {
  toBe: (actual, [expected]) => Object.is(actual, expected),
  toEqual: (actual, [expected]) => deepEqual(actual, expected),
  toContain: contains,
  toMatch: matchesPattern,
  toHaveLength: (actual, [expected]) => lengthOf(actual) === expected,
  toHaveProperty: hasProperty,
  toBeGreaterThan: (actual, expected) => compare(actual, expected, (difference) => difference > 0),
  toBeGreaterThanOrEqual: (actual, expected) => compare(actual, expected, (difference) => difference >= 0),
  toBeLessThan: (actual, expected) => compare(actual, expected, (difference) => difference < 0),
  toBeLessThanOrEqual: (actual, expected) => compare(actual, expected, (difference) => difference <= 0),
  toBeTruthy: (actual) => Boolean(actual),
  toBeFalsy: (actual) => !actual,
  toBeNull: (actual) => actual === null,
  toBeUndefined: (actual) => actual === undefined,
  toBeDefined: (actual) => actual !== undefined,
};

export const MATCHER_NAMES: string[] = Object.keys(MATCHERS);

const MAX_DESCRIBED_LENGTH = 120;

export function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }
  return truncate(safeStringify(value));
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string): string {
  return text.length > MAX_DESCRIBED_LENGTH ? `${text.slice(0, MAX_DESCRIBED_LENGTH)}…` : text;
}

function humanizeMatcher(name: string): string {
  return name
    .replace(/^to/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase();
}

function buildMessage(name: string, actual: unknown, expected: unknown[], negated: boolean): string {
  const subject = `expected ${describeValue(actual)}`;
  const verb = negated ? 'not to' : 'to';
  const operands = expected.map(describeValue).join(', ');
  return `${subject} ${verb} ${humanizeMatcher(name)}${operands ? ` ${operands}` : ''}`;
}

export function evaluateMatcher(name: string, actual: unknown, expected: unknown[], negated = false): MatcherVerdict {
  if (!hasOwn(MATCHERS, name)) {
    return { pass: false, message: `unknown matcher "${name}"` };
  }
  const raw = MATCHERS[name](actual, expected);
  return { pass: raw !== negated, message: buildMessage(name, actual, expected, negated) };
}

import { randomUUID } from 'node:crypto';
import { KeyValue } from '../shared/types';
import { DYNAMIC_VARIABLE_NAMES, DynamicVariableName } from './dynamicVariableNames';

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export function variablesToMap(variables: KeyValue[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const variable of variables) {
    if (variable.enabled && variable.key) {
      map[variable.key] = variable.value;
    }
  }
  return map;
}

export interface DynamicSources {
  nowMs: () => number;
  random: () => number;
  uuid: () => string;
}

export const systemDynamicSources: DynamicSources = {
  nowMs: () => Date.now(),
  random: () => Math.random(),
  uuid: () => randomUUID(),
};

const RANDOM_STRING_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const RANDOM_STRING_LENGTH = 16;
const RANDOM_INT_UPPER_BOUND = 1000;

function randomIntBelow(sources: DynamicSources, bound: number): number {
  return Math.floor(sources.random() * bound);
}

function randomString(sources: DynamicSources, length: number): string {
  return Array.from({ length }, () => RANDOM_STRING_ALPHABET[randomIntBelow(sources, RANDOM_STRING_ALPHABET.length)]).join('');
}

function randomHex(sources: DynamicSources, length: number): string {
  return Array.from({ length }, () => randomIntBelow(sources, 16).toString(16)).join('');
}

type DynamicGenerator = (sources: DynamicSources) => string;

const DYNAMIC_GENERATORS: Record<DynamicVariableName, DynamicGenerator> = {
  $uuid: (sources) => sources.uuid(),
  $guid: (sources) => sources.uuid(),
  $timestamp: (sources) => String(Math.floor(sources.nowMs() / 1000)),
  $timestampMs: (sources) => String(sources.nowMs()),
  $isoTimestamp: (sources) => new Date(sources.nowMs()).toISOString(),
  $randomInt: (sources) => String(randomIntBelow(sources, RANDOM_INT_UPPER_BOUND)),
  $randomString: (sources) => randomString(sources, RANDOM_STRING_LENGTH),
  $randomHex: (sources) => randomHex(sources, RANDOM_STRING_LENGTH),
  $randomBoolean: (sources) => String(sources.random() < 0.5),
};

export { DYNAMIC_VARIABLE_NAMES };

function isDynamicVariableName(name: string): name is DynamicVariableName {
  return (DYNAMIC_VARIABLE_NAMES as readonly string[]).includes(name);
}

export function resolveDynamicVariable(name: string, sources: DynamicSources = systemDynamicSources): string | undefined {
  const generator = isDynamicVariableName(name) ? DYNAMIC_GENERATORS[name] : undefined;
  return generator?.(sources);
}

export function substituteVariables(
  text: string,
  values: Record<string, string>,
  sources: DynamicSources = systemDynamicSources,
): string {
  return text.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      return values[name];
    }
    return resolveDynamicVariable(name, sources) ?? placeholder;
  });
}

import { describe, expect, it } from 'vitest';
import { VariableSuggestion } from '../shared/types';
import { buildVariableSuggestions } from './variableCatalog';
import { describeVariable, indexSuggestions, previewValue, SECRET_MASK, UNRESOLVED_HINT } from './variableHints';

const variable = (key: string, value: string, secret?: boolean) => ({ key, value, enabled: true, secret });

describe('buildVariableSuggestions', () => {
  const suggestions = buildVariableSuggestions(
    [variable('host', 'base-host'), variable('apiKey', 'x', true), { key: 'off', value: '', enabled: false }],
    [variable('host', 'env-host'), variable('token', 'abc', true)],
  );

  it('lets the environment override base variables and appends dynamic ones', () => {
    expect(suggestions.find((entry) => entry.name === 'host')).toEqual({ name: 'host', source: 'environment', value: 'env-host' });
    expect(suggestions.some((entry) => entry.name === '$uuid' && entry.source === 'dynamic')).toBe(true);
    expect(suggestions.some((entry) => entry.name === 'off')).toBe(false);
  });

  it('never carries secret values', () => {
    const secrets = suggestions.filter((entry) => entry.isSecret);
    expect(secrets.map((entry) => entry.name)).toEqual(['token', 'apiKey']);
    expect(secrets.every((entry) => entry.value === undefined)).toBe(true);
  });
});

describe('variable hints', () => {
  const byName = indexSuggestions([
    { name: 'host', source: 'environment', value: 'http://x' },
    { name: 'token', source: 'base', isSecret: true },
    { name: '$uuid', source: 'dynamic' },
    { name: 'blank', source: 'base', value: '' },
  ] as VariableSuggestion[]);

  it('describes resolved values with their scope', () => {
    expect(describeVariable('host', byName)).toBe('host (environment): http://x');
    expect(describeVariable('blank', byName)).toBe('blank (collection): (empty)');
  });

  it('masks secrets and reports unresolved variables', () => {
    expect(describeVariable('token', byName)).toBe(`token (collection): ${SECRET_MASK}`);
    expect(describeVariable('nope', byName)).toBe(`nope: ${UNRESOLVED_HINT}`);
  });

  it('truncates long values and labels dynamic ones', () => {
    expect(previewValue({ name: 'x', source: 'base', value: 'a'.repeat(60) })).toBe(`${'a'.repeat(40)}…`);
    expect(previewValue({ name: '$uuid', source: 'dynamic' })).toBe('generated on send');
  });
});

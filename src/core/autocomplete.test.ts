import { describe, expect, it } from 'vitest';
import { filterHeaderNames, filterVariableSuggestions, findPlaceholderTrigger, insertVariable } from './autocomplete';
import { createCollection } from './factories';
import { collectVariableSuggestions } from './variableSuggestions';

describe('findPlaceholderTrigger', () => {
  it('finds an unclosed placeholder before the caret', () => {
    expect(findPlaceholderTrigger('http://{{ho', 11)).toEqual({ start: 7, query: 'ho' });
    expect(findPlaceholderTrigger('{{', 2)).toEqual({ start: 0, query: '' });
  });

  it('ignores closed placeholders and whitespace', () => {
    expect(findPlaceholderTrigger('{{host}}/x', 10)).toBeUndefined();
    expect(findPlaceholderTrigger('{{a b', 5)).toBeUndefined();
    expect(findPlaceholderTrigger('plain', 5)).toBeUndefined();
  });

  it('uses the nearest placeholder when several exist', () => {
    expect(findPlaceholderTrigger('{{a}}-{{b', 9)).toEqual({ start: 6, query: 'b' });
  });
});

describe('insertVariable', () => {
  it('completes the placeholder and moves the caret after it', () => {
    const trigger = { start: 7, query: 'ho' };
    expect(insertVariable('http://{{ho/x', 11, trigger, 'host')).toEqual({ text: 'http://{{host}}/x', caret: 15 });
  });

  it('does not duplicate existing closing braces', () => {
    expect(insertVariable('{{ho}}', 4, { start: 0, query: 'ho' }, 'host')).toEqual({ text: '{{host}}', caret: 8 });
  });
});

describe('suggestion filtering', () => {
  it('filters variables fuzzily', () => {
    const variables = [{ name: 'baseUrl', source: 'base' as const }, { name: '$uuid', source: 'dynamic' as const }];
    expect(filterVariableSuggestions(variables, 'bu').map((variable) => variable.name)).toEqual(['baseUrl']);
    expect(filterVariableSuggestions(variables, '')).toHaveLength(2);
  });

  it('suggests header names, skipping used ones and exact matches', () => {
    expect(filterHeaderNames('content-t')[0]).toBe('Content-Type');
    expect(filterHeaderNames('content-t', ['content-type'])).not.toContain('Content-Type');
    expect(filterHeaderNames('Accept')).not.toContain('Accept');
  });
});

describe('collectVariableSuggestions', () => {
  it('combines active environment, base and dynamic variables without duplicates', () => {
    const collection = {
      ...createCollection('C', () => 'c'),
      variables: [{ key: 'host', value: '', enabled: true }, { key: 'off', value: '', enabled: false }],
      environments: [{ id: 'dev', name: 'dev', variables: [{ key: 'host', value: '', enabled: true }, { key: 'token', value: '', enabled: true, secret: true }] }],
      activeEnvironmentId: 'dev',
    };
    const suggestions = collectVariableSuggestions(collection);
    expect(suggestions.slice(0, 2)).toEqual([{ name: 'host', source: 'environment' }, { name: 'token', source: 'environment' }]);
    expect(suggestions.map((suggestion) => suggestion.name)).toContain('$uuid');
    expect(suggestions.filter((suggestion) => suggestion.name === 'host')).toHaveLength(1);
    expect(suggestions.map((suggestion) => suggestion.name)).not.toContain('off');
  });
});

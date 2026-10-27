import { describe, expect, it } from 'vitest';
import { createCollection, createRequest } from './factories';
import { toOwnBody } from './jsonValues';
import { serializeCollection, slugify } from './serialization';

describe('serializeCollection', () => {
  it('emits 2-space JSON with canonical key order regardless of input order', () => {
    const collection = createCollection('C', () => 'c1');
    const request = createRequest('R', () => 'r1');
    collection.items.push({ auth: request.auth, url: 'u', id: 'r1', name: 'R', method: 'GET', body: request.body, headers: [], params: [] });
    const text = serializeCollection(collection);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "id": "c1"');
    const keys = Object.keys(JSON.parse(text).items[0]);
    expect(keys).toEqual(['id', 'name', 'method', 'url', 'params', 'headers', 'body', 'auth']);
  });
});

describe('serializeCollection v2', () => {
  it('writes the version first and keeps folders, environments and the active environment', () => {
    const collection = createCollection('C', () => 'c1');
    collection.items.push({ id: 'f1', name: 'F', items: [createRequest('R', () => 'r1')] });
    collection.environments.push({ id: 'e1', name: 'dev', variables: [{ key: 'a', value: '1', enabled: true }] });
    collection.activeEnvironmentId = 'e1';
    const parsed = JSON.parse(serializeCollection(collection));
    expect(Object.keys(parsed)).toEqual(['version', 'id', 'name', 'variables', 'environments', 'activeEnvironmentId', 'items']);
    expect(parsed.version).toBe(2);
    expect(parsed.items[0].items[0].id).toBe('r1');
  });

  it('omits the active environment when none is set', () => {
    expect(JSON.parse(serializeCollection(createCollection('C', () => 'c1')))).not.toHaveProperty('activeEnvironmentId');
  });
});

describe('slugify', () => {
  it('produces safe file name parts', () => {
    expect(slugify('  My API / v2!  ')).toBe('my-api-v2');
    expect(slugify('???')).toBe('collection');
  });
});

describe('body serialization', () => {
  it('keeps legacy bodies free of new fields and round-trips new ones', () => {
    expect(toOwnBody({ type: 'json', text: '{}', form: [] })).toEqual({ type: 'json', text: '{}', form: [] });
    const body = {
      type: 'multipart' as const,
      text: '',
      form: [],
      multipart: [{ key: 'f', kind: 'file' as const, value: '/a', enabled: true }],
      filePath: '/b',
      graphqlVariables: '{}',
    };
    expect(toOwnBody(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });
});

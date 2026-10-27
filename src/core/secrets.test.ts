import { describe, expect, it } from 'vitest';
import { createCollection } from './factories';
import { parseOwnCollection } from './collectionFormat';
import { buildExportFile } from './postman';
import { serializeCollection } from './serialization';
import {
  BASE_SCOPE, extractDraftSecrets, hydrateCollection, listActiveSecretRefs, listSecretRefs, secretStorageKey, staleSecretRefs, stripDraftSecrets,
} from './secrets';

const variable = (key: string, value: string, secret = false) => ({ key, value, enabled: true, ...(secret ? { secret } : {}) });

function collectionWithSecrets() {
  return {
    ...createCollection('C', () => 'c'),
    variables: [variable('host', 'h'), variable('token', 'base-secret', true)],
    environments: [
      { id: 'dev', name: 'dev', variables: [variable('key', 'dev-secret', true)] },
      { id: 'prod', name: 'prod', variables: [variable('key', 'prod-secret', true)] },
    ],
    activeEnvironmentId: 'dev',
  };
}

describe('secret persistence', () => {
  it('writes secret variables to the file with an empty value', () => {
    const written = JSON.parse(serializeCollection(collectionWithSecrets()));
    expect(written.variables[1]).toEqual({ key: 'token', value: '', enabled: true, secret: true });
    expect(written.environments[0].variables[0].value).toBe('');
    expect(serializeCollection(collectionWithSecrets())).not.toMatch(/-secret/);
  });

  it('omits secret values from exports', () => {
    expect(JSON.stringify(buildExportFile([collectionWithSecrets()]))).not.toMatch(/-secret/);
  });

  it('reads old files without the secret flag and keeps flagged ones', () => {
    const parsed = parseOwnCollection({ id: 'c', name: 'C', variables: [{ key: 'a', value: '1' }, { key: 'b', value: '', secret: true }] }, (id) => String(id));
    expect(parsed.variables).toEqual([{ key: 'a', value: '1', enabled: true }, { key: 'b', value: '', enabled: true, secret: true }]);
  });
});

describe('secret references', () => {
  it('keys secrets by collection, scope and name', () => {
    expect(secretStorageKey('c1', { scope: BASE_SCOPE, name: 'token' })).toBe('routiq/c1/base/token');
  });

  it('lists every secret, or only those of the active environment', () => {
    const collection = collectionWithSecrets();
    expect(listSecretRefs(collection)).toEqual([
      { scope: 'base', name: 'token' }, { scope: 'dev', name: 'key' }, { scope: 'prod', name: 'key' },
    ]);
    expect(listActiveSecretRefs(collection)).toEqual([{ scope: 'base', name: 'token' }, { scope: 'dev', name: 'key' }]);
  });

  it('reports secrets that disappeared from a draft', () => {
    const collection = collectionWithSecrets();
    const next = [{ scope: 'base', name: 'token' }];
    expect(staleSecretRefs(listSecretRefs(collection), next)).toEqual([{ scope: 'dev', name: 'key' }, { scope: 'prod', name: 'key' }]);
  });
});

describe('draft secrets', () => {
  it('extracts values and blanks them in the stripped draft', () => {
    const draft = collectionWithSecrets();
    expect(extractDraftSecrets(draft)).toContainEqual({ scope: 'dev', name: 'key', value: 'dev-secret' });
    const stripped = stripDraftSecrets(draft);
    expect(stripped.variables).toEqual([variable('host', 'h'), variable('token', '', true)]);
    expect(stripped.environments[1].variables[0].value).toBe('');
  });
});

describe('hydrateCollection', () => {
  it('fills secrets from the lookup and falls back to the file value', () => {
    const collection = { ...collectionWithSecrets(), variables: [variable('token', 'legacy', true), variable('other', '', true)] };
    const hydrated = hydrateCollection(collection, (scope, name) => (scope === 'dev' && name === 'key' ? 'from-vault' : undefined));
    expect(hydrated.variables.map((entry) => entry.value)).toEqual(['legacy', '']);
    expect(hydrated.environments[0].variables[0].value).toBe('from-vault');
  });
});

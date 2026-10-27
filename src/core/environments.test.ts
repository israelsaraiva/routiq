import { describe, expect, it } from 'vitest';
import { applyEnvironmentsDraft, findActiveEnvironment, resolveCollectionVariables, sanitizeActiveEnvironmentId } from './environments';
import { createCollection } from './factories';

const enabled = (key: string, value: string) => ({ key, value, enabled: true });

function collectionWithEnvironments() {
  return {
    ...createCollection('C', () => 'c'),
    variables: [enabled('host', 'base'), enabled('shared', 'base')],
    environments: [
      { id: 'dev', name: 'dev', variables: [enabled('host', 'dev'), { ...enabled('off', 'x'), enabled: false }] },
      { id: 'prod', name: 'prod', variables: [enabled('host', 'prod')] },
    ],
  };
}

describe('resolveCollectionVariables', () => {
  it('uses only base variables without an active environment', () => {
    expect(resolveCollectionVariables(collectionWithEnvironments())).toEqual({ host: 'base', shared: 'base' });
  });

  it('lets the active environment override base variables', () => {
    const resolved = resolveCollectionVariables({ ...collectionWithEnvironments(), activeEnvironmentId: 'dev' });
    expect(resolved).toEqual({ host: 'dev', shared: 'base' });
  });

  it('ignores a dangling active environment id', () => {
    const collection = { ...collectionWithEnvironments(), activeEnvironmentId: 'gone' };
    expect(findActiveEnvironment(collection)).toBeUndefined();
    expect(resolveCollectionVariables(collection).host).toBe('base');
  });
});

describe('applyEnvironmentsDraft', () => {
  it('replaces variables and environments and drops an active id that no longer exists', () => {
    const collection = { ...collectionWithEnvironments(), activeEnvironmentId: 'dev' };
    const next = applyEnvironmentsDraft(collection, {
      variables: [enabled('a', '1')],
      environments: [{ id: 'prod', name: 'prod', variables: [] }],
      activeEnvironmentId: 'dev',
    });
    expect(next.variables).toEqual([enabled('a', '1')]);
    expect(next.environments.map((environment) => environment.id)).toEqual(['prod']);
    expect(next).not.toHaveProperty('activeEnvironmentId');
  });

  it('keeps a valid active id', () => {
    const next = applyEnvironmentsDraft(collectionWithEnvironments(), {
      variables: [],
      environments: collectionWithEnvironments().environments,
      activeEnvironmentId: 'prod',
    });
    expect(next.activeEnvironmentId).toBe('prod');
    expect(sanitizeActiveEnvironmentId([], 'prod')).toBeUndefined();
  });
});

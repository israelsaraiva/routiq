import { Collection, Environment, EnvironmentsDraft, EnvironmentSummary } from '../shared/types';
import { IdGenerator, generateId } from './ids';
import { variablesToMap } from './variables';

export function createEnvironment(name: string, newId: IdGenerator = generateId): Environment {
  return { id: newId(), name, variables: [] };
}

export function findActiveEnvironment(collection: Collection): Environment | undefined {
  return collection.environments.find((environment) => environment.id === collection.activeEnvironmentId);
}

export function resolveCollectionVariables(collection: Collection): Record<string, string> {
  const active = findActiveEnvironment(collection);
  return { ...variablesToMap(collection.variables), ...(active ? variablesToMap(active.variables) : {}) };
}

export function summarizeEnvironments(collection: Collection): EnvironmentSummary[] {
  return collection.environments.map(({ id, name }) => ({ id, name }));
}

export function sanitizeActiveEnvironmentId(environments: Environment[], activeEnvironmentId?: string): string | undefined {
  return environments.some((environment) => environment.id === activeEnvironmentId) ? activeEnvironmentId : undefined;
}

export function applyEnvironmentsDraft(collection: Collection, draft: EnvironmentsDraft): Collection {
  const next: Collection = { ...collection, variables: draft.variables, environments: draft.environments };
  const activeEnvironmentId = sanitizeActiveEnvironmentId(draft.environments, draft.activeEnvironmentId);
  if (activeEnvironmentId) {
    next.activeEnvironmentId = activeEnvironmentId;
  } else {
    delete next.activeEnvironmentId;
  }
  return next;
}

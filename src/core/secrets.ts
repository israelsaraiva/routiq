import { Collection, Environment, EnvironmentsDraft, KeyValue } from '../shared/types';
import { findActiveEnvironment } from './environments';

export const BASE_SCOPE = 'base';

export interface SecretRef {
  scope: string;
  name: string;
}

export interface SecretEntry extends SecretRef {
  value: string;
}

export type SecretLookup = (scope: string, name: string) => string | undefined;

export function collectionSecretPrefix(collectionId: string): string {
  return `routiq/${collectionId}/`;
}

export function secretStorageKey(collectionId: string, ref: SecretRef): string {
  return `${collectionSecretPrefix(collectionId)}${ref.scope}/${ref.name}`;
}

function secretNames(variables: KeyValue[]): string[] {
  return variables.filter((variable) => variable.secret && variable.key).map((variable) => variable.key);
}

function refsOf(scope: string, variables: KeyValue[]): SecretRef[] {
  return secretNames(variables).map((name) => ({ scope, name }));
}

function refsOfEnvironments(environments: Environment[]): SecretRef[] {
  return environments.flatMap((environment) => refsOf(environment.id, environment.variables));
}

export function listSecretRefs(source: Pick<EnvironmentsDraft, 'variables' | 'environments'>): SecretRef[] {
  return [...refsOf(BASE_SCOPE, source.variables), ...refsOfEnvironments(source.environments)];
}

export function listActiveSecretRefs(collection: Collection): SecretRef[] {
  const active = findActiveEnvironment(collection);
  return [...refsOf(BASE_SCOPE, collection.variables), ...(active ? refsOf(active.id, active.variables) : [])];
}

function sameRef(left: SecretRef, right: SecretRef): boolean {
  return left.scope === right.scope && left.name === right.name;
}

export function staleSecretRefs(previous: SecretRef[], next: SecretRef[]): SecretRef[] {
  return previous.filter((ref) => !next.some((candidate) => sameRef(candidate, ref)));
}

function withoutSecretValues(variables: KeyValue[]): KeyValue[] {
  return variables.map((variable) => (variable.secret ? { ...variable, value: '' } : variable));
}

export function stripDraftSecrets(draft: EnvironmentsDraft): EnvironmentsDraft {
  return {
    ...draft,
    variables: withoutSecretValues(draft.variables),
    environments: draft.environments.map((environment) => ({ ...environment, variables: withoutSecretValues(environment.variables) })),
  };
}

function entriesOf(scope: string, variables: KeyValue[]): SecretEntry[] {
  return variables.filter((variable) => variable.secret && variable.key).map((variable) => ({ scope, name: variable.key, value: variable.value }));
}

export function extractDraftSecrets(draft: EnvironmentsDraft): SecretEntry[] {
  return [
    ...entriesOf(BASE_SCOPE, draft.variables),
    ...draft.environments.flatMap((environment) => entriesOf(environment.id, environment.variables)),
  ];
}

function hydrateVariables(variables: KeyValue[], scope: string, lookup: SecretLookup): KeyValue[] {
  return variables.map((variable) => (variable.secret ? { ...variable, value: lookup(scope, variable.key) ?? variable.value } : variable));
}

export function hydrateEnvironments(draft: EnvironmentsDraft, lookup: SecretLookup): EnvironmentsDraft {
  return {
    ...draft,
    variables: hydrateVariables(draft.variables, BASE_SCOPE, lookup),
    environments: draft.environments.map((environment) => ({
      ...environment,
      variables: hydrateVariables(environment.variables, environment.id, lookup),
    })),
  };
}

export function hydrateCollection(collection: Collection, lookup: SecretLookup): Collection {
  return { ...collection, ...hydrateEnvironments(collection, lookup) };
}

import { Collection, CollectionEntry, Environment, FolderModel, KeyValue } from '../shared/types';
import { BASE_SCOPE, SecretRef } from './secrets';
import { findFolder, insertEntry, isFolder, removeEntry } from './collectionTree';
import { IdGenerator, generateId } from './ids';

export interface SecretMove {
  from: SecretRef;
  to: SecretRef;
}

export interface NestResult {
  collections: Collection[];
  sourceCollectionId: string;
  targetCollectionId: string;
  secretMoves: SecretMove[];
  warnings: string[];
}

export interface PromoteResult {
  collections: Collection[];
  promoted: Collection;
}

export interface NestDestination {
  collectionId: string;
  folderId?: string;
}

interface VariableMerge {
  variables: KeyValue[];
  secretNames: string[];
  warnings: string[];
}

function collectEntryIds(entries: CollectionEntry[]): string[] {
  return entries.flatMap((entry) => [entry.id, ...(isFolder(entry) ? collectEntryIds(entry.items) : [])]);
}

function withUniqueIds(entries: CollectionEntry[], takenIds: Set<string>, newId: IdGenerator): CollectionEntry[] {
  return entries.map((entry) => {
    const id = takenIds.has(entry.id) ? newId() : entry.id;
    takenIds.add(id);
    return isFolder(entry) ? { ...entry, id, items: withUniqueIds(entry.items, takenIds, newId) } : { ...entry, id };
  });
}

function sameVariable(left: KeyValue, right: KeyValue): boolean {
  return left.value === right.value && Boolean(left.secret) === Boolean(right.secret);
}

function mergeVariables(source: KeyValue[], target: KeyValue[], label: string): VariableMerge {
  const merged = [...target];
  const secretNames: string[] = [];
  const warnings: string[] = [];
  for (const variable of source) {
    const existing = target.find((candidate) => candidate.key === variable.key);
    if (!existing) {
      merged.push(variable);
      variable.secret && variable.key && secretNames.push(variable.key);
    } else if (!sameVariable(existing, variable)) {
      warnings.push(`${label} variable "${variable.key}" already exists in the target; its value was kept and the moved one dropped.`);
    }
  }
  return { variables: merged, secretNames, warnings };
}

function secretMovesFor(sourceScope: string, targetScope: string, names: string[]): SecretMove[] {
  return names.map((name) => ({ from: { scope: sourceScope, name }, to: { scope: targetScope, name } }));
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function mergeEnvironments(source: Collection, target: Collection, newId: IdGenerator) {
  const environments = [...target.environments];
  const secretMoves: SecretMove[] = [];
  const warnings: string[] = [];
  for (const environment of source.environments) {
    const matchIndex = environments.findIndex((candidate) => sameName(candidate.name, environment.name));
    const match: Environment | undefined = environments[matchIndex];
    const base: Environment = match ?? { id: newId(), name: environment.name, variables: [] };
    const merge = mergeVariables(environment.variables, base.variables, `Environment "${environment.name}"`);
    const merged: Environment = { ...base, variables: merge.variables };
    match ? (environments[matchIndex] = merged) : environments.push(merged);
    secretMoves.push(...secretMovesFor(environment.id, merged.id, merge.secretNames));
    warnings.push(...merge.warnings);
  }
  return { environments, secretMoves, warnings };
}

function mergeCollectionScope(source: Collection, target: Collection, newId: IdGenerator) {
  const base = mergeVariables(source.variables, target.variables, 'Base');
  const environments = mergeEnvironments(source, target, newId);
  const activeWarning = source.activeEnvironmentId ? ['The active environment selection of the moved collection was not carried over.'] : [];
  return {
    variables: base.variables,
    environments: environments.environments,
    secretMoves: [...secretMovesFor(BASE_SCOPE, BASE_SCOPE, base.secretNames), ...environments.secretMoves],
    warnings: [...base.warnings, ...environments.warnings, ...activeWarning],
  };
}

export function nestCollection(
  collections: Collection[],
  collectionId: string,
  destination: NestDestination,
  newId: IdGenerator = generateId,
): NestResult | undefined {
  const source = collections.find((collection) => collection.id === collectionId);
  const target = collections.find((collection) => collection.id === destination.collectionId);
  const folderMissing = destination.folderId !== undefined && target !== undefined && !findFolder(target.items, destination.folderId);
  if (!source || !target || source.id === target.id || folderMissing) {
    return undefined;
  }
  const takenIds = new Set([...collectEntryIds(target.items), ...target.environments.map((environment) => environment.id)]);
  const folderId = takenIds.has(source.id) ? newId() : source.id;
  takenIds.add(folderId);
  const folder: FolderModel = { id: folderId, name: source.name, items: withUniqueIds(source.items, takenIds, newId) };
  const scope = mergeCollectionScope(source, target, newId);
  const updatedTarget: Collection = {
    ...target,
    variables: scope.variables,
    environments: scope.environments,
    items: insertEntry(target.items, folder, destination.folderId),
  };
  return {
    collections: collections.filter((collection) => collection.id !== source.id).map((collection) => (collection.id === target.id ? updatedTarget : collection)),
    sourceCollectionId: source.id,
    targetCollectionId: target.id,
    secretMoves: scope.secretMoves,
    warnings: scope.warnings,
  };
}

export function promoteFolder(collections: Collection[], folderId: string, newId: IdGenerator = generateId): PromoteResult | undefined {
  const source = collections.find((collection) => findFolder(collection.items, folderId));
  const folder = source && findFolder(source.items, folderId);
  if (!source || !folder) {
    return undefined;
  }
  const promoted: Collection = { id: newId(), name: folder.name, items: folder.items, variables: [], environments: [] };
  const withoutFolder = collections.map((collection) => (collection.id === source.id ? { ...collection, items: removeEntry(collection.items, folderId) } : collection));
  const sourceIndex = withoutFolder.findIndex((collection) => collection.id === source.id);
  return { collections: [...withoutFolder.slice(0, sourceIndex + 1), promoted, ...withoutFolder.slice(sourceIndex + 1)], promoted };
}

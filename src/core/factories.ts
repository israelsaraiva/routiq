import { BodyType, Collection, CollectionEntry, DEFAULT_GRPC_CONFIG, FolderModel, RequestKind, RequestModel } from '../shared/types';
import { isFolder } from './collectionTree';
import { IdGenerator, generateId } from './ids';

const INITIAL_BODY_TYPES: Record<RequestKind, BodyType> = { http: 'none', sse: 'none', websocket: 'none', grpc: 'json', graphql: 'graphql' };

export function createRequest(name: string, newId: IdGenerator = generateId, kind: RequestKind = 'http'): RequestModel {
  return {
    id: newId(),
    name,
    ...(kind === 'http' ? {} : { kind }),
    ...(kind === 'grpc' ? { grpc: structuredClone(DEFAULT_GRPC_CONFIG) } : {}),
    method: kind === 'graphql' ? 'POST' : 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: INITIAL_BODY_TYPES[kind], text: '', form: [] },
    auth: { type: 'none' },
  };
}

export function createFolder(name: string, newId: IdGenerator = generateId): FolderModel {
  return { id: newId(), name, items: [] };
}

export function createCollection(name: string, newId: IdGenerator = generateId): Collection {
  return { id: newId(), name, items: [], variables: [], environments: [] };
}

export function cloneRequestWithNewId(request: RequestModel, newId: IdGenerator = generateId): RequestModel {
  return { ...structuredClone(request), id: newId() };
}

export function cloneCollectionWithNewIds(collection: Collection, newId: IdGenerator = generateId): Collection {
  const environmentIds = new Map<string, string>();
  const environments = collection.environments.map((environment) => {
    const id = newId();
    environmentIds.set(environment.id, id);
    return { ...structuredClone(environment), id };
  });
  const copy: Collection = {
    ...structuredClone(collection),
    id: newId(),
    items: collection.items.map((entry) => cloneEntryWithNewIds(entry, newId)),
    environments,
  };
  if (collection.activeEnvironmentId) {
    copy.activeEnvironmentId = environmentIds.get(collection.activeEnvironmentId);
  }
  return copy;
}

export function cloneEntryWithNewIds(entry: CollectionEntry, newId: IdGenerator = generateId): CollectionEntry {
  if (isFolder(entry)) {
    return { ...structuredClone(entry), id: newId(), items: entry.items.map((child) => cloneEntryWithNewIds(child, newId)) };
  }
  return cloneRequestWithNewId(entry, newId);
}

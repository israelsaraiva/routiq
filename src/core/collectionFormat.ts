import { Collection, CollectionEntry, Environment, RequestModel } from '../shared/types';
import { createRequest } from './factories';
import { Json, isObject, toKeyValues, toMethod, toOwnAuth, toOwnBody } from './jsonValues';

export type IdResolver = (existingId: unknown) => string;

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parseGrpc(source: Json): Partial<RequestModel> {
  const grpc = source.grpc;
  if (!isObject(grpc)) {
    return {};
  }
  return {
    grpc: {
      tls: grpc.tls === true,
      protoFiles: toStringList(grpc.protoFiles),
      importPaths: toStringList(grpc.importPaths),
      service: typeof grpc.service === 'string' ? grpc.service : '',
      method: typeof grpc.method === 'string' ? grpc.method : '',
    },
  };
}

function parseStreamFields(source: Json): Partial<RequestModel> {
  return {
    ...parseGrpc(source),
    ...(source.kind === 'sse' || source.kind === 'websocket' || source.kind === 'grpc' || source.kind === 'graphql' ? { kind: source.kind } : {}),
    ...(source.stream === true ? { stream: true } : {}),
    ...(typeof source.subprotocols === 'string' && source.subprotocols !== '' ? { subprotocols: source.subprotocols } : {}),
    ...(source.autoReconnect === true ? { autoReconnect: true } : {}),
  };
}

function parseScripts(source: Json): Partial<RequestModel> {
  const scripts = source.scripts;
  if (!isObject(scripts)) {
    return {};
  }
  const pre = typeof scripts.pre === 'string' ? scripts.pre : '';
  const post = typeof scripts.post === 'string' ? scripts.post : '';
  return pre || post ? { scripts: { pre, post } } : {};
}

function parseRequest(source: Json, resolveId: IdResolver): CollectionEntry {
  return {
    ...createRequest(String(source.name ?? 'Untitled'), () => resolveId(source.id)),
    ...parseStreamFields(source),
    method: toMethod(source.method),
    url: typeof source.url === 'string' ? source.url : '',
    params: toKeyValues(source.params),
    headers: toKeyValues(source.headers),
    body: toOwnBody(source.body),
    auth: toOwnAuth(source.auth),
    ...parseScripts(source),
  };
}

function parseEntries(entries: unknown, resolveId: IdResolver): CollectionEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(isObject).map((source) =>
    Array.isArray(source.items)
      ? { id: resolveId(source.id), name: String(source.name ?? 'Folder'), items: parseEntries(source.items, resolveId) }
      : parseRequest(source, resolveId),
  );
}

function parseEnvironments(entries: unknown, resolveId: IdResolver): Array<{ sourceId: unknown; environment: Environment }> {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(isObject).map((source) => ({
    sourceId: source.id,
    environment: { id: resolveId(source.id), name: String(source.name ?? 'Environment'), variables: toKeyValues(source.variables) },
  }));
}

export function parseOwnCollection(source: Json, resolveId: IdResolver): Collection {
  const id = resolveId(source.id);
  const parsedEnvironments = parseEnvironments(source.environments, resolveId);
  const activeMatch =
    typeof source.activeEnvironmentId === 'string'
      ? parsedEnvironments.find((parsed) => parsed.sourceId === source.activeEnvironmentId)
      : undefined;
  const collection: Collection = {
    id,
    name: String(source.name ?? 'Imported Collection'),
    variables: toKeyValues(source.variables),
    environments: parsedEnvironments.map((parsed) => parsed.environment),
    items: parseEntries(Array.isArray(source.items) ? source.items : source.requests, resolveId),
  };
  if (activeMatch) {
    collection.activeEnvironmentId = activeMatch.environment.id;
  }
  return collection;
}

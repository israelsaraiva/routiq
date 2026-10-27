import { Auth, COLLECTION_FILE_VERSION, Collection, CollectionEntry, Environment, GrpcConfig, KeyValue, RequestBody, RequestModel } from '../shared/types';
import { isFolder } from './collectionTree';

function orderKeyValues(pairs: KeyValue[]): KeyValue[] {
  return pairs.map(({ key, value, enabled }) => ({ key, value, enabled }));
}

function orderVariables(variables: KeyValue[]): KeyValue[] {
  return variables.map(({ key, value, enabled, secret }) =>
    secret ? { key, value: '', enabled, secret: true } : { key, value, enabled },
  );
}

function orderAuth(auth: Auth): Auth {
  if (auth.type === 'bearer') {
    return { type: 'bearer', token: auth.token };
  }
  if (auth.type === 'basic') {
    return { type: 'basic', username: auth.username, password: auth.password };
  }
  if (auth.type === 'apikey') {
    return { type: 'apikey', key: auth.key, value: auth.value, location: auth.location };
  }
  if (auth.type === 'digest') {
    return { type: 'digest', username: auth.username, password: auth.password };
  }
  if (auth.type === 'oauth2') {
    const { grant, tokenUrl, clientId, clientSecret, scope, username, password } = auth;
    return { type: 'oauth2', grant, tokenUrl, clientId, clientSecret, scope, username, password };
  }
  return { type: 'none' };
}

function orderBody(body: RequestBody): RequestBody {
  const ordered: RequestBody = { type: body.type, text: body.text, form: orderKeyValues(body.form) };
  if (body.multipart && body.multipart.length > 0) {
    ordered.multipart = body.multipart.map(({ key, kind, value, enabled }) => ({ key, kind, value, enabled }));
  }
  if (body.filePath) {
    ordered.filePath = body.filePath;
  }
  if (body.graphqlVariables) {
    ordered.graphqlVariables = body.graphqlVariables;
  }
  if (body.graphqlOperationName) {
    ordered.graphqlOperationName = body.graphqlOperationName;
  }
  return ordered;
}

function orderGrpc(grpc: GrpcConfig): GrpcConfig {
  return { tls: grpc.tls, protoFiles: [...grpc.protoFiles], importPaths: [...grpc.importPaths], service: grpc.service, method: grpc.method };
}

function orderStreamFields(request: RequestModel): Partial<RequestModel> {
  return {
    ...(request.kind && request.kind !== 'http' ? { kind: request.kind } : {}),
    ...(request.stream ? { stream: true } : {}),
    ...(request.subprotocols ? { subprotocols: request.subprotocols } : {}),
    ...(request.autoReconnect ? { autoReconnect: true } : {}),
    ...(request.grpc ? { grpc: orderGrpc(request.grpc) } : {}),
  };
}

function orderScripts(request: RequestModel): Partial<RequestModel> {
  const { scripts } = request;
  return scripts && (scripts.pre || scripts.post) ? { scripts: { pre: scripts.pre, post: scripts.post } } : {};
}

function orderRequest(request: RequestModel): RequestModel {
  return {
    id: request.id,
    name: request.name,
    ...orderStreamFields(request),
    method: request.method,
    url: request.url,
    params: orderKeyValues(request.params),
    headers: orderKeyValues(request.headers),
    body: orderBody(request.body),
    auth: orderAuth(request.auth),
    ...orderScripts(request),
  };
}

function orderEntry(entry: CollectionEntry): CollectionEntry {
  if (isFolder(entry)) {
    return { id: entry.id, name: entry.name, items: entry.items.map(orderEntry) };
  }
  return orderRequest(entry);
}

function orderEnvironment(environment: Environment): Environment {
  return { id: environment.id, name: environment.name, variables: orderVariables(environment.variables) };
}

export function orderCollection(collection: Collection): Collection {
  return {
    id: collection.id,
    name: collection.name,
    variables: orderVariables(collection.variables),
    environments: collection.environments.map(orderEnvironment),
    ...(collection.activeEnvironmentId ? { activeEnvironmentId: collection.activeEnvironmentId } : {}),
    ...(collection.order === undefined ? {} : { order: collection.order }),
    items: collection.items.map(orderEntry),
  };
}

export function serializeCollection(collection: Collection): string {
  return `${JSON.stringify({ version: COLLECTION_FILE_VERSION, ...orderCollection(collection) }, null, 2)}\n`;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || 'collection';
}

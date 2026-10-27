import { Auth, Collection, CollectionEntry, Environment, KeyValue, MultipartField, OAuth2Auth, RequestBody, RequestModel } from '../shared/types';
import { createCollection, createFolder, createRequest } from './factories';
import { IdGenerator, generateId } from './ids';
import { Json, isObject, toMethod } from './jsonValues';
import { withGraphqlKindWhenApplicable } from './graphql/kind';

const FORM_MIME_TYPE = 'application/x-www-form-urlencoded';
const MULTIPART_MIME_TYPE = 'multipart/form-data';
const GRAPHQL_MIME_TYPE = 'application/graphql';
const BINARY_MIME_TYPE = 'application/octet-stream';

export function isInsomniaExport(data: Json): boolean {
  return data._type === 'export' && Array.isArray(data.resources);
}

function resourcesOfType(resources: Json[], type: string): Json[] {
  return resources.filter((resource) => resource._type === type);
}

function childrenOf(resources: Json[], parentId: string): Json[] {
  return resources.filter((resource) => resource.parentId === parentId);
}

function toNamedPairs(entries: unknown): KeyValue[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter((entry) => isObject(entry) && typeof entry.name === 'string')
    .map((entry) => ({ key: entry.name, value: String(entry.value ?? ''), enabled: entry.disabled !== true }));
}

function textBodyType(mimeType: string): RequestBody['type'] {
  if (mimeType.includes('json')) {
    return 'json';
  }
  return mimeType.includes('xml') ? 'xml' : 'text';
}

function toMultipartField(param: Json): MultipartField {
  const isFile = param.type === 'file';
  return {
    key: param.name,
    kind: isFile ? 'file' : 'text',
    value: String(isFile ? (param.fileName ?? '') : (param.value ?? '')),
    enabled: param.disabled !== true,
  };
}

function toMultipartFields(params: unknown): MultipartField[] {
  return Array.isArray(params) ? params.filter((param) => isObject(param) && typeof param.name === 'string').map(toMultipartField) : [];
}

function parseJsonObject(text: string): Json | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toGraphqlBody(text: unknown): RequestBody {
  const payload = typeof text === 'string' ? parseJsonObject(text) : undefined;
  if (!payload || typeof payload.query !== 'string') {
    return { type: 'graphql', text: typeof text === 'string' ? text : '', form: [] };
  }
  const hasVariables = isObject(payload.variables) && Object.keys(payload.variables).length > 0;
  return { type: 'graphql', text: payload.query, form: [], ...(hasVariables ? { graphqlVariables: JSON.stringify(payload.variables, null, 2) } : {}) };
}

function toBody(body: unknown): RequestBody {
  const empty: RequestBody = { type: 'none', text: '', form: [] };
  if (!isObject(body)) {
    return empty;
  }
  if (body.mimeType === FORM_MIME_TYPE) {
    return { ...empty, type: 'form', form: toNamedPairs(body.params) };
  }
  if (body.mimeType === MULTIPART_MIME_TYPE) {
    return { ...empty, type: 'multipart', multipart: toMultipartFields(body.params) };
  }
  if (body.mimeType === GRAPHQL_MIME_TYPE) {
    return toGraphqlBody(body.text);
  }
  if (body.mimeType === BINARY_MIME_TYPE && typeof body.fileName === 'string' && body.fileName !== '') {
    return { ...empty, type: 'binary', filePath: body.fileName };
  }
  if (typeof body.text !== 'string' || body.text === '') {
    return empty;
  }
  return { ...empty, type: textBodyType(String(body.mimeType ?? '')), text: body.text };
}

function toAuth(authentication: unknown): Auth {
  if (!isObject(authentication) || authentication.disabled === true) {
    return { type: 'none' };
  }
  if (authentication.type === 'bearer') {
    return { type: 'bearer', token: String(authentication.token ?? '') };
  }
  if (authentication.type === 'basic') {
    return { type: 'basic', username: String(authentication.username ?? ''), password: String(authentication.password ?? '') };
  }
  if (authentication.type === 'digest') {
    return { type: 'digest', username: String(authentication.username ?? ''), password: String(authentication.password ?? '') };
  }
  if (authentication.type === 'apikey') {
    return toApiKeyAuth(authentication);
  }
  return authentication.type === 'oauth2' ? toOAuth2Auth(authentication) : { type: 'none' };
}

function toApiKeyAuth(authentication: Json): Auth {
  return {
    type: 'apikey',
    key: String(authentication.key ?? ''),
    value: String(authentication.value ?? ''),
    location: authentication.addTo === 'queryParams' ? 'query' : 'header',
  };
}

function toOAuth2Auth(authentication: Json): Auth {
  const grant = authentication.grantType;
  if (grant !== 'client_credentials' && grant !== 'password') {
    return { type: 'none' };
  }
  const oauth: OAuth2Auth = {
    type: 'oauth2',
    grant,
    tokenUrl: String(authentication.accessTokenUrl ?? ''),
    clientId: String(authentication.clientId ?? ''),
    clientSecret: String(authentication.clientSecret ?? ''),
    scope: String(authentication.scope ?? ''),
    username: String(authentication.username ?? ''),
    password: String(authentication.password ?? ''),
  };
  return oauth;
}

function toRequest(resource: Json, newId: IdGenerator): RequestModel {
  return withGraphqlKindWhenApplicable({
    ...createRequest(String(resource.name ?? 'Untitled'), newId),
    method: toMethod(resource.method),
    url: String(resource.url ?? ''),
    params: toNamedPairs(resource.parameters),
    headers: toNamedPairs(resource.headers),
    body: toBody(resource.body),
    auth: toAuth(resource.authentication),
  });
}

function sortBySortKey(resources: Json[]): Json[] {
  const sortKey = (resource: Json) => (typeof resource.metaSortKey === 'number' ? resource.metaSortKey : 0);
  return [...resources].sort((left, right) => sortKey(left) - sortKey(right));
}

function toEntries(resources: Json[], parentId: string, newId: IdGenerator): CollectionEntry[] {
  return sortBySortKey(childrenOf(resources, parentId)).flatMap((resource): CollectionEntry[] => {
    if (resource._type === 'request_group') {
      const folder = createFolder(String(resource.name ?? 'Folder'), newId);
      return [{ ...folder, items: toEntries(resources, String(resource._id), newId) }];
    }
    return resource._type === 'request' ? [toRequest(resource, newId)] : [];
  });
}

function stringifyVariable(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function secretMark(secret: boolean): { secret?: true } {
  return secret ? { secret: true } : {};
}

function toVariablesFromPairs(pairs: Json[], isPrivate: boolean): KeyValue[] {
  return pairs
    .filter((pair) => typeof pair.name === 'string')
    .map((pair) => ({
      key: pair.name,
      value: stringifyVariable(pair.value),
      enabled: pair.enabled !== false,
      ...secretMark(isPrivate || pair.type === 'secret'),
    }));
}

function toVariables(resource: Json): KeyValue[] {
  const isPrivate = resource.isPrivate === true;
  if (Array.isArray(resource.kvPairData)) {
    return toVariablesFromPairs(resource.kvPairData.filter(isObject), isPrivate);
  }
  if (!isObject(resource.data)) {
    return [];
  }
  return Object.entries(resource.data).map(([key, value]) => ({ key, value: stringifyVariable(value), enabled: true, ...secretMark(isPrivate) }));
}

function toEnvironment(resource: Json, newId: IdGenerator): Environment {
  return { id: newId(), name: String(resource.name ?? 'Environment'), variables: toVariables(resource) };
}

function importEnvironments(resources: Json[], workspaceId: string, collection: Collection, newId: IdGenerator): void {
  const [baseEnvironment] = sortBySortKey(childrenOf(resourcesOfType(resources, 'environment'), workspaceId));
  if (!baseEnvironment) {
    return;
  }
  collection.variables = toVariables(baseEnvironment);
  const subEnvironments = sortBySortKey(childrenOf(resourcesOfType(resources, 'environment'), String(baseEnvironment._id)));
  collection.environments = subEnvironments.map((resource) => toEnvironment(resource, newId));
}

function importWorkspace(workspace: Json, resources: Json[], newId: IdGenerator): Collection {
  const collection = createCollection(String(workspace.name ?? 'Insomnia Import'), newId);
  const workspaceId = String(workspace._id);
  collection.items = toEntries(resources, workspaceId, newId);
  importEnvironments(resources, workspaceId, collection, newId);
  return collection;
}

export function importInsomnia(data: Json, newId: IdGenerator = generateId): Collection[] {
  const resources: Json[] = data.resources.filter(isObject);
  return resourcesOfType(resources, 'workspace').map((workspace) => importWorkspace(workspace, resources, newId));
}

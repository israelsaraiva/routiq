import { Collection, CollectionEntry, Environment, KeyValue, RequestBody, RequestModel } from '../shared/types';
import { isFolder } from './collectionTree';
import { exportPostmanAuth } from './postmanAuth';
import { buildQueryString, activePairs } from './url';

export const POSTMAN_SCHEMA_V21 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

type PostmanJson = Record<string, unknown>;

function toPostmanPairs(pairs: KeyValue[]): PostmanJson[] {
  return pairs.map((pair) => ({ key: pair.key, value: pair.value, ...(pair.enabled ? {} : { disabled: true }) }));
}

function rawUrlWithQuery(request: RequestModel): string {
  const query = buildQueryString(request.params);
  if (!query) {
    return request.url;
  }
  return `${request.url}${request.url.includes('?') ? '&' : '?'}${query}`;
}

function toPostmanUrl(request: RequestModel): PostmanJson {
  const query = toPostmanPairs(request.params.filter((pair) => pair.key.trim() !== ''));
  return { raw: rawUrlWithQuery(request), ...(query.length > 0 ? { query } : {}) };
}

function rawBody(text: string, language: string): PostmanJson {
  return { mode: 'raw', raw: text, options: { raw: { language } } };
}

function toPostmanBody(body: RequestBody): PostmanJson | undefined {
  switch (body.type) {
    case 'json':
      return rawBody(body.text, 'json');
    case 'xml':
      return rawBody(body.text, 'xml');
    case 'text':
      return rawBody(body.text, 'text');
    case 'form':
      return { mode: 'urlencoded', urlencoded: toPostmanPairs(body.form) };
    case 'multipart':
      return { mode: 'formdata', formdata: (body.multipart ?? []).map(toFormDataField) };
    case 'binary':
      return body.filePath ? { mode: 'file', file: { src: body.filePath } } : undefined;
    case 'graphql':
      return { mode: 'graphql', graphql: { query: body.text, variables: body.graphqlVariables ?? '' } };
    default:
      return undefined;
  }
}

function toFormDataField(field: NonNullable<RequestBody['multipart']>[number]): PostmanJson {
  const value = field.kind === 'file' ? { type: 'file', src: field.value } : { type: 'text', value: field.value };
  return { key: field.key, ...value, ...(field.enabled ? {} : { disabled: true }) };
}

function toPostmanRequestItem(request: RequestModel): PostmanJson {
  const body = toPostmanBody(request.body);
  const auth = exportPostmanAuth(request.auth);
  return {
    name: request.name,
    request: {
      method: request.method,
      header: toPostmanPairs(request.headers),
      url: toPostmanUrl(request),
      ...(body ? { body } : {}),
      ...(auth ? { auth } : {}),
    },
  };
}

function toPostmanItem(entry: CollectionEntry): PostmanJson {
  return isFolder(entry) ? { name: entry.name, item: entry.items.map(toPostmanItem) } : toPostmanRequestItem(entry);
}

function toPostmanVariables(variables: KeyValue[]): PostmanJson[] {
  return activePairs(variables).map((variable) => ({ key: variable.key, value: variable.secret ? '' : variable.value }));
}

export function buildPostmanEnvironment(environment: Environment): PostmanJson {
  return {
    id: environment.id,
    name: environment.name,
    values: environment.variables
      .filter((variable) => variable.key.trim() !== '')
      .map((variable) => ({
        key: variable.key,
        value: variable.secret ? '' : variable.value,
        type: variable.secret ? 'secret' : 'default',
        enabled: variable.enabled,
      })),
    _postman_variable_scope: 'environment',
  };
}

export function buildPostmanExport(collection: Collection): PostmanJson {
  return {
    info: { _postman_id: collection.id, name: collection.name, schema: POSTMAN_SCHEMA_V21 },
    item: collection.items.map(toPostmanItem),
    variable: toPostmanVariables(collection.variables),
  };
}

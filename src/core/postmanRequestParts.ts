import { ApiKeyLocation, Auth, MultipartField, RequestBody } from '../shared/types';
import { Json, isObject, toKeyValues } from './jsonValues';

const EMPTY_BODY: RequestBody = { type: 'none', text: '', form: [] };

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function firstSource(source: unknown): string {
  return Array.isArray(source) ? stringOrEmpty(source[0]) : stringOrEmpty(source);
}

function toFormDataField(entry: Json): MultipartField {
  const isFile = entry.type === 'file';
  return {
    key: entry.key,
    kind: isFile ? 'file' : 'text',
    value: isFile ? firstSource(entry.src) : stringOrEmpty(entry.value),
    enabled: entry.disabled !== true,
  };
}

function toFormDataFields(formdata: unknown): MultipartField[] {
  return Array.isArray(formdata) ? formdata.filter((entry) => isObject(entry) && typeof entry.key === 'string').map(toFormDataField) : [];
}

function rawBodyType(language: unknown): RequestBody['type'] {
  if (language === 'json') {
    return 'json';
  }
  return language === 'xml' ? 'xml' : 'text';
}

function graphqlBody(graphql: unknown): RequestBody {
  const source = isObject(graphql) ? graphql : {};
  const variables = stringOrEmpty(source.variables);
  return { ...EMPTY_BODY, type: 'graphql', text: stringOrEmpty(source.query), ...(variables.trim() !== '' ? { graphqlVariables: variables } : {}) };
}

export function toPostmanBody(body: unknown): RequestBody {
  if (!isObject(body)) {
    return EMPTY_BODY;
  }
  switch (body.mode) {
    case 'raw':
      return { ...EMPTY_BODY, type: rawBodyType(body.options?.raw?.language), text: String(body.raw ?? '') };
    case 'urlencoded':
      return { ...EMPTY_BODY, type: 'form', form: toKeyValues(body.urlencoded) };
    case 'formdata':
      return { ...EMPTY_BODY, type: 'multipart', multipart: toFormDataFields(body.formdata) };
    case 'graphql':
      return graphqlBody(body.graphql);
    case 'file':
      return { ...EMPTY_BODY, type: 'binary', filePath: stringOrEmpty(body.file?.src) };
    default:
      return EMPTY_BODY;
  }
}

function findAuthValue(entries: unknown, key: string): string {
  if (!Array.isArray(entries)) {
    return '';
  }
  const match = entries.find((entry) => isObject(entry) && entry.key === key);
  return match && match.value !== undefined && match.value !== null ? String(match.value) : '';
}

function apiKeyLocation(entries: unknown): ApiKeyLocation {
  return findAuthValue(entries, 'in') === 'query' ? 'query' : 'header';
}

function toPostmanOAuth2(entries: unknown): Auth | undefined {
  const grantType = findAuthValue(entries, 'grant_type');
  const grant = grantType === 'client_credentials' ? 'client_credentials' : grantType === 'password_credentials' || grantType === 'password' ? 'password' : undefined;
  if (!grant) {
    return undefined;
  }
  return {
    type: 'oauth2',
    grant,
    tokenUrl: findAuthValue(entries, 'accessTokenUrl'),
    clientId: findAuthValue(entries, 'clientId'),
    clientSecret: findAuthValue(entries, 'clientSecret'),
    scope: findAuthValue(entries, 'scope'),
    username: findAuthValue(entries, 'username'),
    password: findAuthValue(entries, 'password'),
  };
}

export function describeUnsupportedPostmanAuth(auth: unknown): string | undefined {
  if (!isObject(auth) || typeof auth.type !== 'string' || auth.type === 'noauth') {
    return undefined;
  }
  return toPostmanAuth(auth).type === 'none' ? auth.type : undefined;
}

export function toPostmanAuth(auth: unknown): Auth {
  if (!isObject(auth)) {
    return { type: 'none' };
  }
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', token: findAuthValue(auth.bearer, 'token') };
    case 'basic':
      return { type: 'basic', username: findAuthValue(auth.basic, 'username'), password: findAuthValue(auth.basic, 'password') };
    case 'apikey':
      return { type: 'apikey', key: findAuthValue(auth.apikey, 'key'), value: findAuthValue(auth.apikey, 'value'), location: apiKeyLocation(auth.apikey) };
    case 'digest':
      return { type: 'digest', username: findAuthValue(auth.digest, 'username'), password: findAuthValue(auth.digest, 'password') };
    case 'oauth2':
      return toPostmanOAuth2(auth.oauth2) ?? { type: 'none' };
    default:
      return { type: 'none' };
  }
}

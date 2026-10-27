import { Auth, BodyType, HTTP_METHODS, HttpMethod, KeyValue, MultipartField, RequestBody } from '../shared/types';

export type Json = Record<string, any>;

const BODY_TYPES: BodyType[] = ['none', 'json', 'text', 'xml', 'form', 'multipart', 'binary', 'graphql'];

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toMethod(value: unknown): HttpMethod {
  const upper = typeof value === 'string' ? value.toUpperCase() : 'GET';
  return (HTTP_METHODS as string[]).includes(upper) ? (upper as HttpMethod) : 'GET';
}

export function toKeyValues(entries: unknown): KeyValue[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter((entry) => isObject(entry) && typeof entry.key === 'string')
    .map((entry) => ({
      key: entry.key,
      value: typeof entry.value === 'string' ? entry.value : '',
      enabled: entry.disabled !== true && entry.enabled !== false,
      ...(entry.secret === true ? { secret: true } : {}),
    }));
}

export function toMultipartFields(entries: unknown): MultipartField[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter((entry) => isObject(entry) && typeof entry.key === 'string')
    .map((entry) => ({
      key: entry.key,
      kind: entry.kind === 'file' ? 'file' : 'text',
      value: typeof entry.value === 'string' ? entry.value : '',
      enabled: entry.enabled !== false,
    }));
}

export function toOwnBody(body: unknown): RequestBody {
  if (!isObject(body)) {
    return { type: 'none', text: '', form: [] };
  }
  const type = BODY_TYPES.includes(body.type) ? (body.type as BodyType) : 'none';
  const own: RequestBody = { type, text: String(body.text ?? ''), form: toKeyValues(body.form) };
  const multipart = toMultipartFields(body.multipart);
  if (multipart.length > 0) {
    own.multipart = multipart;
  }
  if (typeof body.filePath === 'string' && body.filePath !== '') {
    own.filePath = body.filePath;
  }
  if (typeof body.graphqlVariables === 'string' && body.graphqlVariables !== '') {
    own.graphqlVariables = body.graphqlVariables;
  }
  if (typeof body.graphqlOperationName === 'string' && body.graphqlOperationName !== '') {
    own.graphqlOperationName = body.graphqlOperationName;
  }
  return own;
}

export function toOwnAuth(auth: unknown): Auth {
  if (!isObject(auth)) {
    return { type: 'none' };
  }
  if (auth.type === 'bearer') {
    return { type: 'bearer', token: String(auth.token ?? '') };
  }
  if (auth.type === 'basic') {
    return { type: 'basic', username: String(auth.username ?? ''), password: String(auth.password ?? '') };
  }
  if (auth.type === 'apikey') {
    return { type: 'apikey', key: String(auth.key ?? ''), value: String(auth.value ?? ''), location: auth.location === 'query' ? 'query' : 'header' };
  }
  if (auth.type === 'digest') {
    return { type: 'digest', username: String(auth.username ?? ''), password: String(auth.password ?? '') };
  }
  if (auth.type === 'oauth2') {
    return toOwnOAuth2(auth);
  }
  return { type: 'none' };
}

function toOwnOAuth2(auth: Record<string, unknown>): Auth {
  return {
    type: 'oauth2',
    grant: auth.grant === 'password' ? 'password' : 'client_credentials',
    tokenUrl: String(auth.tokenUrl ?? ''),
    clientId: String(auth.clientId ?? ''),
    clientSecret: String(auth.clientSecret ?? ''),
    scope: String(auth.scope ?? ''),
    username: String(auth.username ?? ''),
    password: String(auth.password ?? ''),
  };
}

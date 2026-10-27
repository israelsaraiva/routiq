import { Auth, KeyValue, MultipartField, RequestBody, RequestModel } from '../shared/types';
import { AwsSigningSettings } from './awsSigV4';
import { DigestCredentials } from './digest';
import { activePairs, buildQueryString, buildUrl } from './url';
import { substituteVariables } from './variables';

export type PreparedMultipartPart =
  | { kind: 'text'; name: string; value: string }
  | { kind: 'file'; name: string; filePath: string };

export interface PreparedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  multipart?: PreparedMultipartPart[];
  bodyFilePath?: string;
  digest?: DigestCredentials;
  awsSigV4?: AwsSigningSettings;
}

export interface PrepareContext {
  oauthAuthorization?: string;
}

const METHODS_WITHOUT_BODY = ['GET', 'HEAD'];

function resolvePairs(pairs: KeyValue[], values: Record<string, string>): KeyValue[] {
  return pairs.map((pair) => ({
    ...pair,
    key: substituteVariables(pair.key, values),
    value: substituteVariables(pair.value, values),
  }));
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((existing) => existing.toLowerCase() === name.toLowerCase());
}

function buildHeaders(request: RequestModel, values: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of activePairs(resolvePairs(request.headers, values))) {
    headers[header.key] = header.value;
  }
  return headers;
}

function authorizationValue(auth: Auth, values: Record<string, string>, context: PrepareContext): string | undefined {
  if (auth.type === 'bearer') {
    return `Bearer ${substituteVariables(auth.token, values)}`;
  }
  if (auth.type === 'basic') {
    const credentials = `${substituteVariables(auth.username, values)}:${substituteVariables(auth.password, values)}`;
    return `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
  }
  if (auth.type === 'oauth2') {
    return context.oauthAuthorization;
  }
  return undefined;
}

function apiKeyPair(auth: Auth, values: Record<string, string>, location: 'header' | 'query'): KeyValue | undefined {
  if (auth.type !== 'apikey' || auth.location !== location || auth.key.trim() === '') {
    return undefined;
  }
  return { key: substituteVariables(auth.key.trim(), values), value: substituteVariables(auth.value, values), enabled: true };
}

function digestCredentials(auth: Auth, values: Record<string, string>): DigestCredentials | undefined {
  if (auth.type !== 'digest') {
    return undefined;
  }
  return { username: substituteVariables(auth.username, values), password: substituteVariables(auth.password, values) };
}

function awsSigningSettings(auth: Auth, values: Record<string, string>): AwsSigningSettings | undefined {
  if (auth.type !== 'awsv4') {
    return undefined;
  }
  const sessionToken = substituteVariables(auth.sessionToken, values).trim();
  return {
    credentials: {
      accessKeyId: substituteVariables(auth.accessKey, values).trim(),
      secretAccessKey: substituteVariables(auth.secretKey, values).trim(),
      ...(sessionToken !== '' && { sessionToken }),
    },
    region: substituteVariables(auth.region, values).trim(),
    service: substituteVariables(auth.service, values).trim(),
  };
}

interface BuiltBody {
  body?: string;
  multipart?: PreparedMultipartPart[];
  bodyFilePath?: string;
  contentType?: string;
}

function graphqlPayload(body: RequestBody, values: Record<string, string>): string {
  const payload: Record<string, unknown> = { query: substituteVariables(body.text, values) };
  const variables = parseJsonObject(substituteVariables(body.graphqlVariables ?? '', values));
  if (variables !== undefined) {
    payload.variables = variables;
  }
  const operationName = substituteVariables(body.graphqlOperationName ?? '', values).trim();
  if (operationName !== '') {
    payload.operationName = operationName;
  }
  return JSON.stringify(payload);
}

function parseJsonObject(text: string): unknown {
  if (text.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function multipartParts(fields: MultipartField[], values: Record<string, string>): PreparedMultipartPart[] {
  return fields
    .filter((field) => field.enabled && field.key !== '')
    .map((field) =>
      field.kind === 'file'
        ? { kind: 'file', name: substituteVariables(field.key, values), filePath: substituteVariables(field.value, values) }
        : { kind: 'text', name: substituteVariables(field.key, values), value: substituteVariables(field.value, values) },
    );
}

function buildBody(request: RequestModel, values: Record<string, string>): BuiltBody {
  const { body } = request;
  if (body.type === 'xml') {
    return { body: substituteVariables(body.text, values), contentType: 'application/xml' };
  }
  if (body.type === 'graphql') {
    return { body: graphqlPayload(body, values), contentType: 'application/json' };
  }
  if (body.type === 'multipart') {
    return { multipart: multipartParts(body.multipart ?? [], values) };
  }
  if (body.type === 'binary') {
    const filePath = substituteVariables(body.filePath ?? '', values);
    return filePath === '' ? {} : { bodyFilePath: filePath, contentType: 'application/octet-stream' };
  }
  if (body.type === 'json') {
    return { body: substituteVariables(body.text, values), contentType: 'application/json' };
  }
  if (body.type === 'text') {
    return { body: substituteVariables(body.text, values), contentType: 'text/plain' };
  }
  if (body.type === 'form') {
    return {
      body: buildQueryString(resolvePairs(body.form, values)),
      contentType: 'application/x-www-form-urlencoded',
    };
  }
  return {};
}

export function prepareRequest(
  request: RequestModel,
  values: Record<string, string>,
  context: PrepareContext = {},
): PreparedRequest {
  const headers = buildHeaders(request, values);
  const authorization = authorizationValue(request.auth, values, context);
  if (authorization && !hasHeader(headers, 'Authorization')) {
    headers['Authorization'] = authorization;
  }

  const apiKeyHeader = apiKeyPair(request.auth, values, 'header');
  if (apiKeyHeader && !hasHeader(headers, apiKeyHeader.key)) {
    headers[apiKeyHeader.key] = apiKeyHeader.value;
  }

  const apiKeyQuery = apiKeyPair(request.auth, values, 'query');
  const params = [...resolvePairs(request.params, values), ...(apiKeyQuery ? [apiKeyQuery] : [])];
  const url = buildUrl(substituteVariables(request.url.trim(), values), params);
  const prepared: PreparedRequest = { url, method: request.method, headers };
  const digest = digestCredentials(request.auth, values);
  if (digest) {
    prepared.digest = digest;
  }
  const awsSigV4 = awsSigningSettings(request.auth, values);
  if (awsSigV4) {
    prepared.awsSigV4 = awsSigV4;
  }

  if (METHODS_WITHOUT_BODY.includes(request.method)) {
    return prepared;
  }
  const { body, multipart, bodyFilePath, contentType } = buildBody(request, values);
  if (body !== undefined) {
    prepared.body = body;
  }
  if (multipart) {
    prepared.multipart = multipart;
  }
  if (bodyFilePath) {
    prepared.bodyFilePath = bodyFilePath;
  }
  if (contentType && !hasHeader(headers, 'Content-Type')) {
    headers['Content-Type'] = contentType;
  }
  return prepared;
}

import { Auth, HTTP_METHODS, HttpMethod, KeyValue, MultipartField, RequestBody, RequestModel } from '../shared/types';
import { IdGenerator, generateId } from './ids';
import { createRequest } from './factories';
import { PreparedMultipartPart, PreparedRequest } from './requestBuilder';
import { CurlShell, curlCommandName, lineContinuation, quoteArgument } from './curlShell';
import { ShellSyntaxError } from './shellTokenizer';
import { tokenizeCurlCommand } from './windowsCurlTokenizer';
import { withGraphqlKindWhenApplicable } from './graphql/kind';

export class CurlParseError extends Error {}

export interface CurlImportResult {
  request: RequestModel;
  warnings: string[];
}

const SHORT_OPTIONS_WITH_VALUE = new Set('XHduAebFomxwcTKErCDUQPzyY'.split(''));
const LONG_OPTIONS_WITH_VALUE = new Set([
  'request', 'header', 'data', 'data-ascii', 'data-raw', 'data-binary', 'data-urlencode', 'json', 'user', 'user-agent',
  'referer', 'cookie', 'form', 'form-string', 'oauth2-bearer', 'url', 'output', 'max-time', 'connect-timeout', 'proxy',
  'cacert', 'cert', 'key', 'cookie-jar', 'write-out', 'retry', 'resolve', 'interface', 'limit-rate', 'max-redirs',
  'proxy-user', 'upload-file', 'config', 'range', 'dump-header', 'cert-type', 'capath', 'retry-delay', 'retry-max-time',
  'noproxy', 'connect-to', 'dns-servers', 'keepalive-time', 'expect100-timeout', 'trace', 'trace-ascii', 'time-cond',
  'speed-time', 'speed-limit', 'unix-socket', 'proxy-header',
]);
const LONG_ALIASES: Record<string, string> = {
  request: 'X', header: 'H', data: 'd', 'data-ascii': 'd', user: 'u', 'user-agent': 'A', referer: 'e', cookie: 'b',
  form: 'F', head: 'I', get: 'G',
};

interface CurlDraft {
  method?: string;
  url?: string;
  headers: KeyValue[];
  dataParts: string[];
  jsonParts: string[];
  basicCredentials?: string;
  bearerToken?: string;
  head: boolean;
  getWithData: boolean;
  formFields: MultipartField[];
  binaryFilePath?: string;
  warnings: string[];
}

function newDraft(): CurlDraft {
  return { headers: [], dataParts: [], jsonParts: [], head: false, getWithData: false, formFields: [], warnings: [] };
}

function addHeader(draft: CurlDraft, name: string, value: string): void {
  draft.headers.push({ key: name, value, enabled: true });
}

function addRawHeader(draft: CurlDraft, raw: string): void {
  const separator = raw.indexOf(':');
  if (separator <= 0) {
    return;
  }
  const value = raw.slice(separator + 1).trim();
  if (value !== '') {
    addHeader(draft, raw.slice(0, separator).trim(), value);
  }
}

function isFileReference(value: string): boolean {
  return value.startsWith('@');
}

function addDataPart(draft: CurlDraft, value: string, interpretFileReference: boolean): void {
  if (interpretFileReference && isFileReference(value)) {
    draft.warnings.push(`Body from file "${value}" is not supported and was ignored`);
    return;
  }
  draft.dataParts.push(value);
}

function addBinaryData(draft: CurlDraft, value: string): void {
  if (isFileReference(value)) {
    draft.binaryFilePath = value.slice(1);
    return;
  }
  draft.dataParts.push(value);
}

function stripFormFileModifiers(value: string): string {
  return value.replace(/;(type|filename|headers)=.*$/i, '');
}

function unquoteFormValue(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function addFormField(draft: CurlDraft, raw: string, interpretFileReference: boolean): void {
  const separator = raw.indexOf('=');
  if (separator <= 0) {
    draft.warnings.push(`Form field "${raw}" is not in name=value form and was ignored`);
    return;
  }
  const key = raw.slice(0, separator);
  const value = raw.slice(separator + 1);
  if (interpretFileReference && value.startsWith('<')) {
    draft.warnings.push(`Form field "${key}" reads its text from a file, which is not supported and was ignored`);
    return;
  }
  if (interpretFileReference && isFileReference(value)) {
    draft.formFields.push({ key, kind: 'file', value: stripFormFileModifiers(unquoteFormValue(value.slice(1))), enabled: true });
    return;
  }
  draft.formFields.push({ key, kind: 'text', value: interpretFileReference ? stripFormFileModifiers(value) : value, enabled: true });
}

function addUrlEncodedData(draft: CurlDraft, value: string): void {
  const separator = value.indexOf('=');
  const name = separator === -1 ? '' : value.slice(0, separator);
  const content = separator === -1 ? value : value.slice(separator + 1);
  if (isFileReference(content) || (separator === -1 && name.includes('@'))) {
    draft.warnings.push(`Body from file "${value}" is not supported and was ignored`);
    return;
  }
  const encoded = encodeURIComponent(content);
  draft.dataParts.push(name ? `${name}=${encoded}` : encoded);
}

function addCookie(draft: CurlDraft, value: string): void {
  if (value.includes('=')) {
    addHeader(draft, 'Cookie', value);
  }
}

function applyOption(draft: CurlDraft, option: string, value: string): void {
  switch (option) {
    case 'X':
      draft.method = value.toUpperCase();
      break;
    case 'H':
      addRawHeader(draft, value);
      break;
    case 'd':
      addDataPart(draft, value, true);
      break;
    case 'data-raw':
      addDataPart(draft, value, false);
      break;
    case 'data-binary':
      addBinaryData(draft, value);
      break;
    case 'data-urlencode':
      addUrlEncodedData(draft, value);
      break;
    case 'json':
      draft.jsonParts.push(value);
      break;
    case 'u':
      draft.basicCredentials = value;
      break;
    case 'oauth2-bearer':
      draft.bearerToken = value;
      break;
    case 'A':
      addHeader(draft, 'User-Agent', value);
      break;
    case 'e':
      addHeader(draft, 'Referer', value);
      break;
    case 'b':
      addCookie(draft, value);
      break;
    case 'url':
      draft.url ??= value;
      break;
    case 'F':
      addFormField(draft, value, true);
      break;
    case 'form-string':
      addFormField(draft, value, false);
      break;
  }
}

function applyFlag(draft: CurlDraft, option: string): void {
  if (option === 'I') {
    draft.head = true;
  } else if (option === 'G') {
    draft.getWithData = true;
  }
}

function takesValue(option: string, isLong: boolean): boolean {
  return isLong ? LONG_OPTIONS_WITH_VALUE.has(option) : SHORT_OPTIONS_WITH_VALUE.has(option);
}

function canonicalOption(option: string, isLong: boolean): string {
  return isLong ? LONG_ALIASES[option] ?? option : option;
}

class ArgumentCursor {
  private index = 0;
  constructor(private readonly tokens: string[]) {}

  get done(): boolean {
    return this.index >= this.tokens.length;
  }

  next(): string {
    return this.tokens[this.index++];
  }

  takeValue(option: string): string {
    if (this.done) {
      throw new CurlParseError(`Missing value for option "${option}"`);
    }
    return this.next();
  }
}

function consumeLongOption(draft: CurlDraft, cursor: ArgumentCursor, token: string): void {
  const equals = token.indexOf('=');
  const name = token.slice(2, equals === -1 ? undefined : equals);
  const canonical = canonicalOption(name, true);
  if (takesValue(name, true)) {
    const value = equals === -1 ? cursor.takeValue(`--${name}`) : token.slice(equals + 1);
    applyOption(draft, canonical, value);
  } else {
    applyFlag(draft, canonical);
    applyOption(draft, canonical, '');
  }
}

function consumeShortCluster(draft: CurlDraft, cursor: ArgumentCursor, token: string): void {
  for (let index = 1; index < token.length; index++) {
    const option = token[index];
    if (takesValue(option, false)) {
      const attached = token.slice(index + 1);
      applyOption(draft, option, attached !== '' ? attached : cursor.takeValue(`-${option}`));
      return;
    }
    applyFlag(draft, option);
  }
}

function isOptionToken(token: string): boolean {
  return token.length > 1 && token.startsWith('-');
}

function parseDraft(tokens: string[]): CurlDraft {
  const draft = newDraft();
  const cursor = new ArgumentCursor(tokens);
  while (!cursor.done) {
    const token = cursor.next();
    if (token.startsWith('--') && token.length > 2) {
      consumeLongOption(draft, cursor, token);
    } else if (isOptionToken(token)) {
      consumeShortCluster(draft, cursor, token);
    } else {
      draft.url ??= token;
    }
  }
  return draft;
}

function stripCommandPrefix(tokens: string[]): string[] {
  const withoutPrompt = tokens[0] === '$' ? tokens.slice(1) : tokens;
  if (!/^curl(\.exe)?$/i.test(withoutPrompt[0] ?? '')) {
    throw new CurlParseError('Not a cURL command: it must start with "curl"');
  }
  return withoutPrompt.slice(1);
}

function findHeader(headers: KeyValue[], name: string): KeyValue | undefined {
  return headers.find((header) => header.key.toLowerCase() === name.toLowerCase());
}

function withoutHeader(headers: KeyValue[], header: KeyValue): KeyValue[] {
  return headers.filter((candidate) => candidate !== header);
}

function decodeFormComponent(component: string): string {
  const spaced = component.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function parseFormPairs(text: string): KeyValue[] | undefined {
  if (text === '' || /[\r\n]/.test(text)) {
    return undefined;
  }
  const pairs = text.split('&').map((segment) => {
    const separator = segment.indexOf('=');
    const key = decodeFormComponent(separator === -1 ? segment : segment.slice(0, separator));
    const value = separator === -1 ? '' : decodeFormComponent(segment.slice(separator + 1));
    return { key, value, enabled: true };
  });
  return pairs.every((pair) => pair.key !== '') ? pairs : undefined;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function mediaTypeOf(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

function hasOnlyMediaType(contentType: string): boolean {
  return !contentType.includes(';');
}

interface InferredBody {
  body: RequestBody;
  headers: KeyValue[];
}

function jsonBody(text: string): RequestBody {
  return { type: 'json', text, form: [] };
}

const GRAPHQL_KEYS = new Set(['query', 'variables', 'operationName']);

export function parseGraphqlPayload(text: string): RequestBody | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const variables = record.variables;
  const hasValidVariables = variables === undefined || variables === null || (typeof variables === 'object' && !Array.isArray(variables));
  if (typeof record.query !== 'string' || !Object.keys(record).every((key) => GRAPHQL_KEYS.has(key)) || !hasValidVariables) {
    return undefined;
  }
  const hasValidOperationName = record.operationName === undefined || record.operationName === null || typeof record.operationName === 'string';
  if (!hasValidOperationName) {
    return undefined;
  }
  const graphqlVariables = variables ? JSON.stringify(variables, null, 2) : undefined;
  const graphqlOperationName = typeof record.operationName === 'string' && record.operationName !== '' ? record.operationName : undefined;
  return {
    type: 'graphql',
    text: record.query,
    form: [],
    ...(graphqlVariables ? { graphqlVariables } : {}),
    ...(graphqlOperationName ? { graphqlOperationName } : {}),
  };
}

function inferBody(text: string, headers: KeyValue[]): InferredBody {
  const contentTypeHeader = findHeader(headers, 'Content-Type');
  const contentType = contentTypeHeader?.value ?? '';
  const mediaType = mediaTypeOf(contentType);
  const redundantHeaderRemoved = contentTypeHeader && hasOnlyMediaType(contentType) ? withoutHeader(headers, contentTypeHeader) : headers;

  if (mediaType.includes('json') || (!contentTypeHeader && looksLikeJson(text))) {
    const graphql = parseGraphqlPayload(text);
    if (graphql) {
      return { body: graphql, headers: mediaType === 'application/json' ? redundantHeaderRemoved : headers };
    }
    return { body: jsonBody(text), headers: mediaType === 'application/json' ? redundantHeaderRemoved : headers };
  }
  const formPairs = parseFormPairs(text);
  if (mediaType === 'application/x-www-form-urlencoded' || (!contentTypeHeader && formPairs && text.includes('='))) {
    if (formPairs) {
      return { body: { type: 'form', text: '', form: formPairs }, headers: redundantHeaderRemoved };
    }
  }
  const textBody: RequestBody = { type: 'text', text, form: [] };
  if (!contentTypeHeader) {
    return { body: textBody, headers: [...headers, { key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }] };
  }
  return { body: textBody, headers };
}

function appendQuery(url: string, query: string): string {
  const fragmentIndex = url.indexOf('#');
  const base = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : url.slice(fragmentIndex);
  const separator = !base.includes('?') ? '?' : /[?&]$/.test(base) ? '' : '&';
  return `${base}${separator}${query}${fragment}`;
}

function resolveMethod(draft: CurlDraft, hasBody: boolean, warnings: string[]): HttpMethod {
  const explicit = draft.method;
  if (explicit) {
    if ((HTTP_METHODS as string[]).includes(explicit)) {
      return explicit as HttpMethod;
    }
    warnings.push(`Method ${explicit} is not supported; using GET`);
    return 'GET';
  }
  if (draft.head) {
    return 'HEAD';
  }
  if (draft.getWithData) {
    return 'GET';
  }
  return hasBody || draft.formFields.length > 0 ? 'POST' : 'GET';
}

function resolveAuth(draft: CurlDraft, headers: KeyValue[]): { auth: Auth; headers: KeyValue[] } {
  if (draft.basicCredentials !== undefined) {
    const separator = draft.basicCredentials.indexOf(':');
    const username = separator === -1 ? draft.basicCredentials : draft.basicCredentials.slice(0, separator);
    const password = separator === -1 ? '' : draft.basicCredentials.slice(separator + 1);
    return { auth: { type: 'basic', username, password }, headers };
  }
  const authorization = findHeader(headers, 'Authorization');
  const bearerMatch = /^bearer\s+(.+)$/i.exec(authorization?.value ?? '');
  if (draft.bearerToken !== undefined) {
    return { auth: { type: 'bearer', token: draft.bearerToken }, headers };
  }
  if (authorization && bearerMatch) {
    return { auth: { type: 'bearer', token: bearerMatch[1].trim() }, headers: withoutHeader(headers, authorization) };
  }
  return { auth: { type: 'none' }, headers };
}

function applyJsonShortcut(draft: CurlDraft): void {
  if (draft.jsonParts.length === 0) {
    return;
  }
  draft.dataParts = [draft.jsonParts.join('')];
  if (!findHeader(draft.headers, 'Content-Type')) {
    addHeader(draft, 'Content-Type', 'application/json');
  }
  if (!findHeader(draft.headers, 'Accept')) {
    addHeader(draft, 'Accept', 'application/json');
  }
}

function deriveRequestName(method: HttpMethod, url: string): string {
  try {
    const parsed = new URL(url);
    return `${method} ${parsed.pathname === '/' ? parsed.host : parsed.pathname}`;
  } catch {
    return `${method} ${url.replace(/^[a-z]+:\/\//i, '').split(/[?#]/)[0] || 'Imported'}`;
  }
}

function withoutMultipartContentType(headers: KeyValue[]): KeyValue[] {
  const contentType = findHeader(headers, 'Content-Type');
  return contentType && mediaTypeOf(contentType.value) === 'multipart/form-data' ? withoutHeader(headers, contentType) : headers;
}

function explicitFileBody(draft: CurlDraft, headers: KeyValue[]): InferredBody | undefined {
  if (draft.formFields.length > 0) {
    return { body: { type: 'multipart', text: '', form: [], multipart: draft.formFields }, headers: withoutMultipartContentType(headers) };
  }
  if (draft.binaryFilePath !== undefined) {
    return { body: { type: 'binary', text: '', form: [], filePath: draft.binaryFilePath }, headers };
  }
  return undefined;
}

function buildRequest(draft: CurlDraft, newId: IdGenerator): CurlImportResult {
  if (!draft.url) {
    throw new CurlParseError('No URL found in the cURL command');
  }
  const warnings = [...draft.warnings];
  applyJsonShortcut(draft);
  const joinedData = draft.jsonParts.length > 0 ? draft.dataParts[0] : draft.dataParts.join('&');
  const hasData = draft.dataParts.length > 0 || draft.binaryFilePath !== undefined || draft.formFields.length > 0;
  const sendsDataAsQuery = draft.getWithData && draft.dataParts.length > 0 && draft.jsonParts.length === 0;
  const method = resolveMethod(draft, hasData && !sendsDataAsQuery, warnings);
  const url = sendsDataAsQuery ? appendQuery(draft.url, joinedData) : draft.url;
  const { auth, headers: authHeaders } = resolveAuth(draft, draft.headers);
  const bodyText = hasData && !sendsDataAsQuery ? joinedData : undefined;
  const fileBody = explicitFileBody(draft, authHeaders);
  const inferred = fileBody ?? (bodyText === undefined ? undefined : inferBody(bodyText, authHeaders));
  if (inferred && draft.formFields.length > 0 && draft.dataParts.length > 0) {
    warnings.push('Both form fields (-F) and data (-d) were given; only the form fields were kept');
  }
  if (inferred && (method === 'GET' || method === 'HEAD')) {
    warnings.push(`The body is not sent with ${method} requests`);
  }
  const request: RequestModel = withGraphqlKindWhenApplicable({
    ...createRequest(deriveRequestName(method, url), newId),
    method,
    url,
    headers: inferred?.headers ?? authHeaders,
    body: inferred?.body ?? { type: 'none', text: '', form: [] },
    auth,
  });
  return { request, warnings };
}

export function parseCurlCommand(command: string, newId: IdGenerator = generateId): CurlImportResult {
  try {
    const tokens = stripCommandPrefix(tokenizeCurlCommand(command));
    return buildRequest(parseDraft(tokens), newId);
  } catch (error) {
    if (error instanceof ShellSyntaxError) {
      throw new CurlParseError(`Could not read the cURL command: ${error.message}`);
    }
    throw error;
  }
}

function methodArguments(method: string): string[] {
  if (method === 'GET') {
    return [];
  }
  return method === 'HEAD' ? ['--head'] : ['-X', method];
}

function multipartClause(part: PreparedMultipartPart, shell: CurlShell): string {
  if (part.kind === 'file') {
    return `-F ${quoteArgument(`${part.name}=@${part.filePath}`, shell)}`;
  }
  return `--form-string ${quoteArgument(`${part.name}=${part.value}`, shell)}`;
}

function bodyClauses(prepared: PreparedRequest, shell: CurlShell): string[] {
  if (prepared.multipart) {
    return prepared.multipart.map((part) => multipartClause(part, shell));
  }
  if (prepared.bodyFilePath) {
    return [`--data-binary ${quoteArgument(`@${prepared.bodyFilePath}`, shell)}`];
  }
  return prepared.body === undefined ? [] : [`--data-raw ${quoteArgument(prepared.body, shell)}`];
}

function digestClauses(prepared: PreparedRequest, shell: CurlShell): string[] {
  if (!prepared.digest) {
    return [];
  }
  return [`--digest -u ${quoteArgument(`${prepared.digest.username}:${prepared.digest.password}`, shell)}`];
}

export function curlGenerationWarnings(auth: Auth, prepared: PreparedRequest): string[] {
  const hasAuthorization = Object.keys(prepared.headers).some((name) => name.toLowerCase() === 'authorization');
  if (auth.type === 'awsv4') {
    return ['AWS Signature v4 is computed when the request is sent, so the signed headers were left out of the cURL command.'];
  }
  if (auth.type === 'oauth2' && !hasAuthorization) {
    return ['OAuth 2.0 token is not available, so the Authorization header was left out. Fetch a token first and copy again.'];
  }
  return [];
}

export function generateCurlCommand(prepared: PreparedRequest, shell: CurlShell = 'bash'): string {
  const requestClause = [curlCommandName(shell), ...methodArguments(prepared.method), quoteArgument(prepared.url, shell)].join(' ');
  const headerClauses = Object.entries(prepared.headers).map(([name, value]) => `-H ${quoteArgument(`${name}: ${value}`, shell)}`);
  const clauses = [requestClause, ...digestClauses(prepared, shell), ...headerClauses, ...bodyClauses(prepared, shell)];
  return clauses.join(lineContinuation(shell));
}

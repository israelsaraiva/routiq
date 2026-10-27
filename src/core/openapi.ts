import { Collection, CollectionEntry, FolderModel, HttpMethod, KeyValue, MultipartField, RequestBody, RequestModel } from '../shared/types';
import { createCollection, createFolder, createRequest } from './factories';
import { IdGenerator, generateId } from './ids';
import { Json, isObject } from './jsonValues';
import { ImportWarnings } from './importReport';
import { authVariablesFor, requiresUnsupportedSecurity, resolveOperationAuth } from './openapiAuth';
import { MULTIPART_CONTENT_TYPE, multipartBody, multipartFieldsFromSchema } from './openapiMultipart';
import { RefResolver, createRefResolver, exampleValue } from './openapiSchemaExample';

const OPERATION_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
const BASE_URL_VARIABLE = 'baseUrl';
const JSON_CONTENT_TYPE = 'application/json';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const PATH_PARAMETER_PATTERN = /\{([^}]+)\}/g;

interface ImportContext {
  root: Json;
  resolve: RefResolver;
  newId: IdGenerator;
  warnings: ImportWarnings;
}

export function isOpenApiDocument(data: Json): boolean {
  const isOpenApi3 = typeof data.openapi === 'string' && data.openapi.startsWith('3');
  const isSwagger2 = typeof data.swagger === 'string' && data.swagger.startsWith('2');
  return (isOpenApi3 || isSwagger2) && isObject(data.paths);
}

function applyServerVariables(url: string, variables: unknown): string {
  const defaults = isObject(variables) ? variables : {};
  return url.replace(PATH_PARAMETER_PATTERN, (placeholder, name: string) => {
    const fallback = isObject(defaults[name]) ? defaults[name].default : undefined;
    return fallback === undefined ? placeholder : String(fallback);
  });
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function swaggerBaseUrl(data: Json): string {
  const scheme = Array.isArray(data.schemes) && typeof data.schemes[0] === 'string' ? data.schemes[0] : 'https';
  const host = typeof data.host === 'string' ? `${scheme}://${data.host}` : '';
  return `${host}${typeof data.basePath === 'string' ? data.basePath : ''}`;
}

function openApiBaseUrl(data: Json): string {
  const server = Array.isArray(data.servers) ? data.servers.find(isObject) : undefined;
  return server && typeof server.url === 'string' ? applyServerVariables(server.url, server.variables) : '';
}

export function resolveBaseUrl(data: Json): string {
  const url = typeof data.swagger === 'string' ? swaggerBaseUrl(data) : openApiBaseUrl(data);
  return trimTrailingSlash(url);
}

export function toRequestPath(path: string): string {
  return path.replace(PATH_PARAMETER_PATTERN, '{{$1}}');
}

function stringifyExample(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function resolveParameters(source: unknown, context: ImportContext): Json[] {
  return Array.isArray(source) ? source.filter(isObject).map(context.resolve) : [];
}

function mergeParameters(pathLevel: Json[], operationLevel: Json[]): Json[] {
  const identity = (parameter: Json) => `${parameter.in}:${parameter.name}`;
  const merged = new Map(pathLevel.map((parameter) => [identity(parameter), parameter]));
  operationLevel.forEach((parameter) => merged.set(identity(parameter), parameter));
  return [...merged.values()];
}

function parameterExample(parameter: Json, context: ImportContext): string {
  const schema = parameter.schema ?? parameter;
  const example = parameter.example ?? exampleValue(schema, context.resolve);
  return stringifyExample(example);
}

function toKeyValue(parameter: Json, context: ImportContext): KeyValue {
  return {
    key: String(parameter.name),
    value: parameterExample(parameter, context),
    enabled: parameter.required === true,
  };
}

function parametersIn(parameters: Json[], location: string, context: ImportContext): KeyValue[] {
  return parameters
    .filter((parameter) => parameter.in === location && typeof parameter.name === 'string')
    .map((parameter) => toKeyValue(parameter, context));
}

function formFromSchema(schema: unknown, context: ImportContext): KeyValue[] {
  const example = exampleValue(schema, context.resolve);
  return isObject(example)
    ? Object.entries(example).map(([key, value]) => ({ key, value: stringifyExample(value), enabled: true }))
    : [];
}

function jsonBody(schema: unknown, example: unknown, context: ImportContext): RequestBody {
  const value = example ?? exampleValue(schema, context.resolve);
  return { type: 'json', text: JSON.stringify(value, null, 2), form: [] };
}

function pickMediaType(contentTypes: string[]): string | undefined {
  return (
    contentTypes.find((type) => type === JSON_CONTENT_TYPE) ??
    contentTypes.find((type) => type.includes('json')) ??
    contentTypes.find((type) => type === FORM_CONTENT_TYPE) ??
    contentTypes.find((type) => type === MULTIPART_CONTENT_TYPE) ??
    contentTypes[0]
  );
}

function openApiBody(operation: Json, context: ImportContext): RequestBody | undefined {
  const requestBody = isObject(operation.requestBody) ? context.resolve(operation.requestBody) : undefined;
  const content = requestBody && isObject(requestBody.content) ? requestBody.content : {};
  const mediaType = pickMediaType(Object.keys(content));
  if (!mediaType) {
    return undefined;
  }
  const media = isObject(content[mediaType]) ? content[mediaType] : {};
  return bodyForMediaType(mediaType, media.schema, media.example, context);
}

function bodyForMediaType(mediaType: string, schema: unknown, example: unknown, context: ImportContext): RequestBody {
  if (mediaType.includes('json')) {
    return jsonBody(schema, example, context);
  }
  if (mediaType.includes('xml')) {
    return { type: 'xml', text: stringifyExample(example ?? exampleValue(schema, context.resolve)), form: [] };
  }
  if (mediaType === MULTIPART_CONTENT_TYPE) {
    return multipartBody(multipartFieldsFromSchema(schema, context.resolve));
  }
  if (mediaType === FORM_CONTENT_TYPE) {
    return { type: 'form', text: '', form: formFromSchema(schema, context) };
  }
  return { type: 'text', text: stringifyExample(example ?? exampleValue(schema, context.resolve)), form: [] };
}

function swaggerBody(operation: Json, parameters: Json[], context: ImportContext): RequestBody | undefined {
  const bodyParameter = parameters.find((parameter) => parameter.in === 'body');
  if (bodyParameter) {
    const consumes = Array.isArray(operation.consumes) ? operation.consumes : context.root.consumes;
    const mediaType = pickMediaType(Array.isArray(consumes) ? consumes : [JSON_CONTENT_TYPE]);
    return bodyForMediaType(mediaType ?? JSON_CONTENT_TYPE, bodyParameter.schema, undefined, context);
  }
  const formParameters = parameters.filter((parameter) => parameter.in === 'formData' && typeof parameter.name === 'string');
  if (formParameters.length === 0) {
    return undefined;
  }
  return isSwaggerMultipart(operation, formParameters, context) ? multipartBody(formParameters.map(swaggerMultipartField(context))) : formBody(formParameters, context);
}

function isSwaggerMultipart(operation: Json, formParameters: Json[], context: ImportContext): boolean {
  const consumes = Array.isArray(operation.consumes) ? operation.consumes : context.root.consumes;
  const consumesMultipart = Array.isArray(consumes) && consumes.includes(MULTIPART_CONTENT_TYPE);
  return consumesMultipart || formParameters.some((parameter) => parameter.type === 'file');
}

function swaggerMultipartField(context: ImportContext) {
  return (parameter: Json): MultipartField =>
    parameter.type === 'file'
      ? { key: String(parameter.name), kind: 'file', value: '', enabled: true }
      : { key: String(parameter.name), kind: 'text', value: parameterExample(parameter, context), enabled: true };
}

function formBody(formParameters: Json[], context: ImportContext): RequestBody {
  const form = formParameters.map((parameter) => ({ ...toKeyValue(parameter, context), enabled: true }));
  return { type: 'form', text: '', form };
}

function isSwagger(context: ImportContext): boolean {
  return typeof context.root.swagger === 'string';
}

function buildBody(operation: Json, parameters: Json[], context: ImportContext): RequestBody {
  const body = isSwagger(context) ? swaggerBody(operation, parameters, context) : openApiBody(operation, context);
  return body ?? { type: 'none', text: '', form: [] };
}

function contentTypeHeaders(body: RequestBody): KeyValue[] {
  return body.type === 'json' ? [{ key: 'Content-Type', value: JSON_CONTENT_TYPE, enabled: true }] : [];
}

function requestName(operation: Json, method: string, path: string): string {
  const named = [operation.summary, operation.operationId].find((candidate) => typeof candidate === 'string' && candidate.trim() !== '');
  return named ?? `${method.toUpperCase()} ${path}`;
}

function buildRequest(path: string, method: string, pathLevel: Json[], operation: Json, context: ImportContext): RequestModel {
  const parameters = mergeParameters(pathLevel, resolveParameters(operation.parameters, context));
  const body = buildBody(operation, parameters, context);
  const name = requestName(operation, method, path);
  const auth = resolveOperationAuth(operation, context.root, context.resolve);
  if (requiresUnsupportedSecurity(operation, context.root, auth)) {
    context.warnings.push(`"${name}": none of the declared security schemes is supported; auth was left empty.`);
  }
  return {
    ...createRequest(name, context.newId),
    method: method.toUpperCase() as HttpMethod,
    url: `{{${BASE_URL_VARIABLE}}}${toRequestPath(path)}`,
    params: parametersIn(parameters, 'query', context),
    headers: [...contentTypeHeaders(body), ...parametersIn(parameters, 'header', context)],
    body,
    auth,
  };
}

interface TaggedRequest {
  tag?: string;
  request: RequestModel;
}

function firstTag(operation: Json): string | undefined {
  const tag = Array.isArray(operation.tags) ? operation.tags.find((candidate) => typeof candidate === 'string' && candidate !== '') : undefined;
  return tag;
}

function operationsOfPath(path: string, pathItem: Json, context: ImportContext): TaggedRequest[] {
  const pathLevel = resolveParameters(pathItem.parameters, context);
  return OPERATION_METHODS.filter((method) => isObject(pathItem[method])).map((method) => ({
    tag: firstTag(pathItem[method]),
    request: buildRequest(path, method, pathLevel, pathItem[method], context),
  }));
}

function collectRequests(context: ImportContext): TaggedRequest[] {
  return Object.entries(context.root.paths as Json)
    .filter(([, pathItem]) => isObject(pathItem))
    .flatMap(([path, pathItem]) => operationsOfPath(path, context.resolve(pathItem), context));
}

function groupIntoEntries(requests: TaggedRequest[], context: ImportContext): CollectionEntry[] {
  const folders = new Map<string, FolderModel>();
  const entries: CollectionEntry[] = [];
  requests.forEach(({ tag, request }) => {
    if (tag === undefined) {
      entries.push(request);
      return;
    }
    let folder = folders.get(tag);
    if (!folder) {
      folder = createFolder(tag, context.newId);
      folders.set(tag, folder);
      entries.push(folder);
    }
    folder.items.push(request);
  });
  return entries;
}

function baseUrlVariables(baseUrl: string): KeyValue[] {
  return [{ key: BASE_URL_VARIABLE, value: baseUrl, enabled: true }];
}

export function importOpenApi(data: Json, newId: IdGenerator = generateId, warnings: ImportWarnings = []): Collection {
  const context: ImportContext = { root: data, resolve: createRefResolver(data), newId, warnings };
  const title = isObject(data.info) && typeof data.info.title === 'string' && data.info.title.trim() ? data.info.title : 'OpenAPI Import';
  const collection = createCollection(title, newId);
  const requests = collectRequests(context);
  collection.items = groupIntoEntries(requests, context);
  collection.variables = [...baseUrlVariables(resolveBaseUrl(data)), ...authVariablesFor(requests.map(({ request }) => request))];
  return collection;
}

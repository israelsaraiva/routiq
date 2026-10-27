import { MultipartField, RequestBody } from '../shared/types';
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

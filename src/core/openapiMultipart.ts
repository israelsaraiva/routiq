import { MultipartField, RequestBody } from '../shared/types';
import { Json, isObject } from './jsonValues';
import { RefResolver, exampleValue } from './openapiSchemaExample';

export const MULTIPART_CONTENT_TYPE = 'multipart/form-data';

function stringifyField(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function isBinarySchema(schema: Json, resolve: RefResolver): boolean {
  if (schema.format === 'binary' || schema.type === 'file') {
    return true;
  }
  return isObject(schema.items) && resolve(schema.items).format === 'binary';
}

function fieldOf(key: string, propertySchema: Json, resolve: RefResolver): MultipartField {
  const schema = resolve(propertySchema);
  return isBinarySchema(schema, resolve)
    ? { key, kind: 'file', value: '', enabled: true }
    : { key, kind: 'text', value: stringifyField(exampleValue(schema, resolve)), enabled: true };
}

export function multipartFieldsFromSchema(schema: unknown, resolve: RefResolver): MultipartField[] {
  const resolved = isObject(schema) ? resolve(schema) : {};
  const properties = isObject(resolved.properties) ? resolved.properties : {};
  return Object.entries(properties)
    .filter((entry): entry is [string, Json] => isObject(entry[1]))
    .map(([key, propertySchema]) => fieldOf(key, propertySchema, resolve));
}

export function multipartBody(fields: MultipartField[]): RequestBody {
  return { type: 'multipart', text: '', form: [], multipart: fields };
}

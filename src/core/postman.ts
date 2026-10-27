import { Collection, CollectionEntry, EXPORT_FORMAT_VERSION, KeyValue, RequestModel, RequestScripts } from '../shared/types';
import { parseOwnCollection } from './collectionFormat';
import { createCollection, createFolder, createRequest } from './factories';
import { IdGenerator, generateId } from './ids';
import { Json, isObject, toKeyValues, toMethod } from './jsonValues';
import { ImportWarnings } from './importReport';
import { describeUnsupportedPostmanAuth, toPostmanAuth, toPostmanBody } from './postmanRequestParts';
import { translatePostmanEvents } from './postmanEvents';
import { combineInheritedScripts } from './scriptInheritance';
import { orderCollection } from './serialization';
import { withGraphqlKindWhenApplicable } from './graphql/kind';

function toUrl(url: unknown): string {
  if (typeof url === 'string') {
    return url;
  }
  return isObject(url) && typeof url.raw === 'string' ? url.raw : '';
}

function warnAboutUnsupportedAuth(request: Json, name: string, warnings: ImportWarnings): void {
  const unsupported = describeUnsupportedPostmanAuth(request.auth);
  if (unsupported) {
    warnings.push(`"${name}": auth type "${unsupported}" is not supported and was skipped.`);
  }
}

type InheritedScripts = Array<RequestScripts | undefined>;

function importPostmanRequest(item: Json, newId: IdGenerator, warnings: ImportWarnings, inherited: InheritedScripts): RequestModel {
  const request = isObject(item.request) ? item.request : {};
  const name = String(item.name ?? 'Untitled');
  warnAboutUnsupportedAuth(request, name, warnings);
  const scripts = combineInheritedScripts(inherited, translatePostmanEvents(item.event, name, warnings));
  return withGraphqlKindWhenApplicable({
    ...createRequest(name, newId),
    method: toMethod(request.method),
    url: toUrl(request.url),
    headers: toKeyValues(request.header),
    body: toPostmanBody(request.body),
    auth: toPostmanAuth(request.auth),
    ...(scripts ? { scripts } : {}),
  });
}

function isRequestItem(item: Json): boolean {
  return isObject(item.request) || typeof item.request === 'string';
}

function importPostmanItems(items: unknown, newId: IdGenerator, warnings: ImportWarnings, inherited: InheritedScripts): CollectionEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter(isObject).flatMap((item): CollectionEntry[] => {
    if (Array.isArray(item.item)) {
      const folderName = String(item.name ?? 'Folder');
      const folderScripts = translatePostmanEvents(item.event, `folder ${folderName}`, warnings);
      return [{ ...createFolder(folderName, newId), items: importPostmanItems(item.item, newId, warnings, [...inherited, folderScripts]) }];
    }
    return isRequestItem(item) ? [importPostmanRequest(item, newId, warnings, inherited)] : [];
  });
}

function toCollectionVariables(variables: unknown): KeyValue[] {
  if (!Array.isArray(variables)) {
    return [];
  }
  return variables
    .filter((variable) => isObject(variable) && typeof variable.key === 'string')
    .map((variable) => ({
      key: variable.key,
      value: variable.value === undefined || variable.value === null ? '' : String(variable.value),
      enabled: variable.disabled !== true,
    }));
}

export function importPostmanCollection(data: Json, newId: IdGenerator = generateId, warnings: ImportWarnings = []): Collection {
  const collection = createCollection(String(data.info?.name ?? 'Imported Collection'), newId);
  const collectionScripts = translatePostmanEvents(data.event, `collection ${collection.name}`, warnings);
  collection.items = importPostmanItems(data.item, newId, warnings, [collectionScripts]);
  collection.variables = toCollectionVariables(data.variable);
  return collection;
}

export function isOwnExportFormat(data: Json): boolean {
  return typeof data.version === 'number' && Array.isArray(data.collections);
}

export function isOwnCollectionFormat(data: Json): boolean {
  return (
    typeof data.version === 'number' &&
    typeof data.name === 'string' &&
    (Array.isArray(data.items) || Array.isArray(data.requests))
  );
}

export function isPostmanFormat(data: Json): boolean {
  return isObject(data.info) && Array.isArray(data.item);
}

function reidentifyCollection(source: Json, newId: IdGenerator): Collection {
  return parseOwnCollection(source, () => newId());
}

export function parseImportedCollections(data: unknown, newId: IdGenerator = generateId, warnings: ImportWarnings = []): Collection[] {
  if (!isObject(data)) {
    throw new Error('Unrecognized import file: expected a JSON object.');
  }
  if (isOwnExportFormat(data)) {
    return data.collections.filter(isObject).map((collection: Json) => reidentifyCollection(collection, newId));
  }
  if (isOwnCollectionFormat(data)) {
    return [reidentifyCollection(data, newId)];
  }
  if (isPostmanFormat(data)) {
    return [importPostmanCollection(data, newId, warnings)];
  }
  throw new Error('Unrecognized import file: neither a Routiq export nor a Postman v2.1 collection.');
}

export function buildExportFile(collections: Collection[]) {
  return { version: EXPORT_FORMAT_VERSION, collections: collections.map(orderCollection) };
}

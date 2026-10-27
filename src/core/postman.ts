import { Auth, Collection, CollectionEntry, EXPORT_FORMAT_VERSION, KeyValue, RequestModel, RequestScripts } from '../shared/types';
import { parseOwnCollection } from './collectionFormat';
import { createCollection, createFolder, createRequest } from './factories';
import { IdGenerator, generateId } from './ids';
import { Json, isObject, toKeyValues, toMethod } from './jsonValues';
import { ImportWarnings } from './importReport';
import { importPostmanAuth, inheritsPostmanAuth } from './postmanAuth';
import { toPostmanBody } from './postmanRequestParts';
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

type InheritedScripts = Array<RequestScripts | undefined>;

interface Inheritance {
  scripts: InheritedScripts;
  auth: Auth;
}

const NO_AUTH: Auth = { type: 'none' };

function resolveAuth(source: unknown, label: string, inheritedAuth: Auth, warnings: ImportWarnings): Auth {
  if (inheritsPostmanAuth(source)) {
    return inheritedAuth;
  }
  const imported = importPostmanAuth(source, label);
  warnings.push(...imported.warnings);
  return imported.auth;
}

function importPostmanRequest(item: Json, newId: IdGenerator, warnings: ImportWarnings, inherited: Inheritance): RequestModel {
  const request = isObject(item.request) ? item.request : {};
  const name = String(item.name ?? 'Untitled');
  const scripts = combineInheritedScripts(inherited.scripts, translatePostmanEvents(item.event, name, warnings));
  return withGraphqlKindWhenApplicable({
    ...createRequest(name, newId),
    method: toMethod(request.method),
    url: toUrl(request.url),
    headers: toKeyValues(request.header),
    body: toPostmanBody(request.body),
    auth: resolveAuth(request.auth, name, inherited.auth, warnings),
    ...(scripts ? { scripts } : {}),
  });
}

function isRequestItem(item: Json): boolean {
  return isObject(item.request) || typeof item.request === 'string';
}

function importPostmanItems(items: unknown, newId: IdGenerator, warnings: ImportWarnings, inherited: Inheritance): CollectionEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter(isObject).flatMap((item): CollectionEntry[] => {
    if (Array.isArray(item.item)) {
      const folderName = String(item.name ?? 'Folder');
      const folderScripts = translatePostmanEvents(item.event, `folder ${folderName}`, warnings);
      const folderInheritance = {
        scripts: [...inherited.scripts, folderScripts],
        auth: resolveAuth(item.auth, `folder ${folderName}`, inherited.auth, warnings),
      };
      return [{ ...createFolder(folderName, newId), items: importPostmanItems(item.item, newId, warnings, folderInheritance) }];
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
  const collectionAuth = resolveAuth(data.auth, `collection ${collection.name}`, NO_AUTH, warnings);
  collection.items = importPostmanItems(data.item, newId, warnings, { scripts: [collectionScripts], auth: collectionAuth });
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

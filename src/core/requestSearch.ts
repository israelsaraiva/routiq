import { Collection, CollectionEntry, HttpMethod, RequestModel } from '../shared/types';
import { isFolder } from './collectionTree';
import { fuzzyFilter, fuzzyMatches } from './fuzzy';

export interface RequestSearchEntry {
  requestId: string;
  collectionId: string;
  name: string;
  method: HttpMethod;
  url: string;
  path: string;
}

const PATH_SEPARATOR = ' / ';

function flattenEntries(collection: Collection, items: CollectionEntry[], parents: string[]): RequestSearchEntry[] {
  return items.flatMap((entry) => {
    if (isFolder(entry)) {
      return flattenEntries(collection, entry.items, [...parents, entry.name]);
    }
    return [{
      requestId: entry.id,
      collectionId: collection.id,
      name: entry.name,
      method: entry.method,
      url: entry.url,
      path: [collection.name, ...parents].join(PATH_SEPARATOR),
    }];
  });
}

export function flattenRequests(collections: Collection[]): RequestSearchEntry[] {
  return collections.flatMap((collection) => flattenEntries(collection, collection.items, []));
}

function searchableText(entry: Pick<RequestSearchEntry, 'name' | 'method' | 'url' | 'path'>): string {
  return `${entry.name} ${entry.method} ${entry.url} ${entry.path}`;
}

export function searchRequests(entries: RequestSearchEntry[], query: string): RequestSearchEntry[] {
  return fuzzyFilter(entries, query, searchableText);
}

function requestMatches(request: RequestModel, query: string): boolean {
  return fuzzyMatches(query, searchableText({ name: request.name, method: request.method, url: request.url, path: '' }));
}

export function filterEntries(items: CollectionEntry[], query: string): CollectionEntry[] {
  if (query.trim() === '') {
    return items;
  }
  return items.flatMap((entry): CollectionEntry[] => {
    if (!isFolder(entry)) {
      return requestMatches(entry, query) ? [entry] : [];
    }
    if (fuzzyMatches(query, entry.name)) {
      return [entry];
    }
    const items = filterEntries(entry.items, query);
    return items.length > 0 ? [{ ...entry, items }] : [];
  });
}

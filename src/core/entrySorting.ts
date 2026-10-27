import { CollectionEntry, RequestModel } from '../shared/types';
import { isFolder, updateEntry } from './collectionTree';

export type EntrySortMode = 'name-asc' | 'name-desc' | 'method';

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function methodRank(request: RequestModel): number {
  const rank = METHOD_ORDER.indexOf(request.method.toUpperCase());
  return rank === -1 ? METHOD_ORDER.length : rank;
}

function compareByMethod(a: RequestModel, b: RequestModel): number {
  return methodRank(a) - methodRank(b) || compareNames(a.name, b.name);
}

function compareWithin(mode: EntrySortMode): (a: CollectionEntry, b: CollectionEntry) => number {
  const sign = mode === 'name-desc' ? -1 : 1;
  return (a, b) => {
    if (isFolder(a) !== isFolder(b)) {
      return isFolder(a) ? -1 : 1;
    }
    if (mode === 'method' && !isFolder(a) && !isFolder(b)) {
      return compareByMethod(a, b);
    }
    return sign * compareNames(a.name, b.name);
  };
}

export function sortEntries(items: CollectionEntry[], mode: EntrySortMode, recursive = false): CollectionEntry[] {
  const sorted = [...items].sort(compareWithin(mode));
  return recursive ? sorted.map((entry) => (isFolder(entry) ? { ...entry, items: sortEntries(entry.items, mode, true) } : entry)) : sorted;
}

export function sortFolderItems(items: CollectionEntry[], folderId: string | undefined, mode: EntrySortMode, recursive = false): CollectionEntry[] {
  if (folderId === undefined) {
    return sortEntries(items, mode, recursive);
  }
  return updateEntry(items, folderId, (folder) => (isFolder(folder) ? { ...folder, items: sortEntries(folder.items, mode, recursive) } : folder));
}

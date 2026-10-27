import { Collection, CollectionEntry, FolderModel, RequestModel } from '../shared/types';

export interface Destination {
  collectionId: string;
  folderId?: string;
  beforeEntryId?: string;
}

export interface EntryLocation {
  collectionId: string;
  parentFolderId?: string;
}

export interface FolderChoice {
  id: string;
  path: string;
}

export function isFolder(entry: CollectionEntry): entry is FolderModel {
  return 'items' in entry;
}

export function findEntry(items: CollectionEntry[], entryId: string): CollectionEntry | undefined {
  for (const entry of items) {
    if (entry.id === entryId) {
      return entry;
    }
    const nested = isFolder(entry) ? findEntry(entry.items, entryId) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

export function findRequest(items: CollectionEntry[], requestId: string): RequestModel | undefined {
  const entry = findEntry(items, requestId);
  return entry && !isFolder(entry) ? entry : undefined;
}

export function findFolder(items: CollectionEntry[], folderId: string): FolderModel | undefined {
  const entry = findEntry(items, folderId);
  return entry && isFolder(entry) ? entry : undefined;
}

export function findParentFolderId(items: CollectionEntry[], entryId: string): string | undefined {
  for (const entry of items) {
    if (isFolder(entry)) {
      if (entry.items.some((child) => child.id === entryId)) {
        return entry.id;
      }
      const nested = findParentFolderId(entry.items, entryId);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

export function locateEntry(collections: Collection[], entryId: string): EntryLocation | undefined {
  const collection = collections.find((candidate) => findEntry(candidate.items, entryId));
  return collection && { collectionId: collection.id, parentFolderId: findParentFolderId(collection.items, entryId) };
}

export function updateEntry(
  items: CollectionEntry[],
  entryId: string,
  update: (entry: CollectionEntry) => CollectionEntry | CollectionEntry[] | undefined,
): CollectionEntry[] {
  return items.flatMap((entry) => {
    if (entry.id === entryId) {
      const replacement = update(entry);
      return replacement === undefined ? [] : Array.isArray(replacement) ? replacement : [replacement];
    }
    return [isFolder(entry) ? { ...entry, items: updateEntry(entry.items, entryId, update) } : entry];
  });
}

export function removeEntry(items: CollectionEntry[], entryId: string): CollectionEntry[] {
  return updateEntry(items, entryId, () => undefined);
}

export function renameEntry(items: CollectionEntry[], entryId: string, name: string): CollectionEntry[] {
  return updateEntry(items, entryId, (entry) => ({ ...entry, name }));
}

export function replaceRequest(items: CollectionEntry[], updated: RequestModel): CollectionEntry[] {
  return updateEntry(items, updated.id, () => updated);
}

function insertBefore(items: CollectionEntry[], entry: CollectionEntry, beforeEntryId?: string): CollectionEntry[] {
  const index = items.findIndex((candidate) => candidate.id === beforeEntryId);
  if (index === -1) {
    return [...items, entry];
  }
  return [...items.slice(0, index), entry, ...items.slice(index)];
}

export function insertEntry(
  items: CollectionEntry[],
  entry: CollectionEntry,
  folderId?: string,
  beforeEntryId?: string,
): CollectionEntry[] {
  if (folderId === undefined) {
    return insertBefore(items, entry, beforeEntryId);
  }
  return updateEntry(items, folderId, (folder) =>
    isFolder(folder) ? { ...folder, items: insertBefore(folder.items, entry, beforeEntryId) } : folder,
  );
}

export function insertAfterEntry(items: CollectionEntry[], afterEntryId: string, entry: CollectionEntry): CollectionEntry[] {
  return updateEntry(items, afterEntryId, (existing) => [existing, entry]);
}

export function countRequests(items: CollectionEntry[]): number {
  return items.reduce((total, entry) => total + (isFolder(entry) ? countRequests(entry.items) : 1), 0);
}

export function collectRequestIds(entries: CollectionEntry[]): string[] {
  return entries.flatMap((entry) => (isFolder(entry) ? collectRequestIds(entry.items) : [entry.id]));
}

export function listFolders(items: CollectionEntry[], parentPath = ''): FolderChoice[] {
  return items.filter(isFolder).flatMap((folder) => {
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    return [{ id: folder.id, path }, ...listFolders(folder.items, path)];
  });
}

function wouldNestInsideItself(entry: CollectionEntry, destination: Destination): boolean {
  if (!isFolder(entry) || destination.folderId === undefined) {
    return false;
  }
  return entry.id === destination.folderId || findEntry(entry.items, destination.folderId) !== undefined;
}

function isValidDestination(target: Collection, destination: Destination): boolean {
  return destination.folderId === undefined || findFolder(target.items, destination.folderId) !== undefined;
}

export function moveEntry(collections: Collection[], entryId: string, destination: Destination): Collection[] {
  const source = collections.find((collection) => findEntry(collection.items, entryId));
  const target = collections.find((collection) => collection.id === destination.collectionId);
  const entry = source && findEntry(source.items, entryId);
  if (!source || !target || !entry || destination.beforeEntryId === entryId) {
    return collections;
  }
  if (wouldNestInsideItself(entry, destination) || !isValidDestination(target, destination)) {
    return collections;
  }
  const withoutEntry = removeEntry(source.items, entryId);
  const sameCollection = source.id === target.id;
  const targetItems = sameCollection ? withoutEntry : target.items;
  const insertedItems = insertEntry(targetItems, entry, destination.folderId, destination.beforeEntryId);
  return collections.map((collection) => {
    if (collection.id === target.id) {
      return { ...collection, items: insertedItems };
    }
    return collection.id === source.id ? { ...collection, items: withoutEntry } : collection;
  });
}

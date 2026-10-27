import { Collection, CollectionEntry } from '../shared/types';
import { Destination, findEntry, findFolder, isFolder, locateEntry } from './collectionTree';

function itemsOf(collection: Collection, parentFolderId?: string): CollectionEntry[] {
  return parentFolderId === undefined ? collection.items : (findFolder(collection.items, parentFolderId)?.items ?? []);
}

export function areSiblings(collections: Collection[], entryId: string, otherEntryId: string): boolean {
  const entryLocation = locateEntry(collections, entryId);
  const otherLocation = locateEntry(collections, otherEntryId);
  return (
    entryLocation !== undefined &&
    otherLocation !== undefined &&
    entryLocation.collectionId === otherLocation.collectionId &&
    entryLocation.parentFolderId === otherLocation.parentFolderId
  );
}

export function destinationNextTo(collections: Collection[], entryId: string, targetEntryId: string): Destination | undefined {
  const location = locateEntry(collections, targetEntryId);
  const collection = location && collections.find((candidate) => candidate.id === location.collectionId);
  if (!location || !collection) {
    return undefined;
  }
  const siblings = itemsOf(collection, location.parentFolderId);
  const targetIndex = siblings.findIndex((entry) => entry.id === targetEntryId);
  const draggedIndex = siblings.findIndex((entry) => entry.id === entryId);
  const movesDown = draggedIndex !== -1 && draggedIndex < targetIndex;
  const beforeEntryId = movesDown ? siblings[targetIndex + 1]?.id : targetEntryId;
  return { collectionId: collection.id, folderId: location.parentFolderId, beforeEntryId };
}

export function destinationOnEntry(collections: Collection[], entryId: string, target: CollectionEntry): Destination | undefined {
  const dragged = collections.map((collection) => findEntry(collection.items, entryId)).find((entry) => entry !== undefined);
  const reorders = !isFolder(target) || (dragged !== undefined && isFolder(dragged) && areSiblings(collections, entryId, target.id));
  if (reorders) {
    return destinationNextTo(collections, entryId, target.id);
  }
  const location = locateEntry(collections, target.id);
  return location && { collectionId: location.collectionId, folderId: target.id };
}

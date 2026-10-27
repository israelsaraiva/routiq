import { Collection } from '../shared/types';
import { compareNames } from './entrySorting';

export type SortDirection = 'asc' | 'desc';

function effectiveOrders(collections: Collection[]): number[] {
  return collections.map((collection, index) => collection.order ?? index);
}

export function orderCollections(collections: Collection[]): Collection[] {
  const orders = effectiveOrders(collections);
  return collections
    .map((collection, index) => ({ collection, index }))
    .sort((a, b) => orders[a.index] - orders[b.index] || a.index - b.index)
    .map(({ collection }) => collection);
}

export function nextCollectionOrder(collections: Collection[]): number {
  return Math.max(-1, ...effectiveOrders(collections)) + 1;
}

export function appendCollection(collections: Collection[], collection: Collection): Collection[] {
  return [...collections, { ...collection, order: nextCollectionOrder(collections) }];
}

export function withSequentialOrder(collections: Collection[]): Collection[] {
  return collections.map((collection, index) => (collection.order === index ? collection : { ...collection, order: index }));
}

export function moveCollection(collections: Collection[], collectionId: string, beforeCollectionId?: string): Collection[] {
  const moved = collections.find((collection) => collection.id === collectionId);
  if (!moved || beforeCollectionId === collectionId) {
    return collections;
  }
  const others = collections.filter((collection) => collection.id !== collectionId);
  const index = others.findIndex((collection) => collection.id === beforeCollectionId);
  const reordered = index === -1 ? [...others, moved] : [...others.slice(0, index), moved, ...others.slice(index)];
  return reordered.every((collection, position) => collection === collections[position]) ? collections : withSequentialOrder(reordered);
}

export function sortCollections(collections: Collection[], direction: SortDirection): Collection[] {
  const sign = direction === 'asc' ? 1 : -1;
  return withSequentialOrder([...collections].sort((a, b) => sign * compareNames(a.name, b.name)));
}

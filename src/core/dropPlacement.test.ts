import { describe, expect, it } from 'vitest';
import { Collection, CollectionEntry } from '../shared/types';
import { moveEntry } from './collectionTree';
import { destinationOnEntry } from './dropPlacement';
import { createCollection, createFolder, createRequest } from './factories';

const request = (id: string) => createRequest(id, () => id);
const folder = (id: string, items: CollectionEntry[] = []) => ({ ...createFolder(id, () => id), items });
const collection = (items: CollectionEntry[]): Collection => ({ ...createCollection('c', () => 'c'), items });
const ids = (entries: CollectionEntry[]) => entries.map((entry) => entry.id);

function drop(collections: Collection[], entryId: string, targetId: string, target: CollectionEntry): Collection[] {
  const destination = destinationOnEntry(collections, entryId, target);
  return destination ? moveEntry(collections, entryId, destination) : collections;
}

describe('destinationOnEntry', () => {
  const tree = () => [collection([request('a'), request('b'), request('c'), folder('f1'), folder('f2')])];

  it('inserts before the target when moving up', () => {
    const [result] = drop(tree(), 'c', 'a', request('a'));
    expect(ids(result.items)).toEqual(['c', 'a', 'b', 'f1', 'f2']);
  });

  it('inserts after the target when moving down', () => {
    const [result] = drop(tree(), 'a', 'c', request('c'));
    expect(ids(result.items)).toEqual(['b', 'c', 'a', 'f1', 'f2']);
  });

  it('reorders sibling folders instead of nesting', () => {
    const [result] = drop(tree(), 'f1', 'f2', folder('f2'));
    expect(ids(result.items)).toEqual(['a', 'b', 'c', 'f2', 'f1']);
  });

  it('moves a request into a dropped-on folder', () => {
    const [result] = drop(tree(), 'a', 'f1', folder('f1'));
    expect(ids(result.items)).toEqual(['b', 'c', 'f1', 'f2']);
    expect(ids((result.items[2] as ReturnType<typeof folder>).items)).toEqual(['a']);
  });

  it('moves across parents before the target', () => {
    const collections = [collection([request('a'), folder('f', [request('x'), request('y')])])];
    const [result] = drop(collections, 'a', 'y', request('y'));
    expect(ids((result.items[0] as ReturnType<typeof folder>).items)).toEqual(['x', 'a', 'y']);
  });
});

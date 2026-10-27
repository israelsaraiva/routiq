import { describe, expect, it } from 'vitest';
import { Collection, CollectionEntry, FolderModel } from '../shared/types';
import {
  collectRequestIds, countRequests, findEntry, findFolder, insertAfterEntry, listFolders, locateEntry, moveEntry, removeEntry, renameEntry,
} from './collectionTree';
import { cloneCollectionWithNewIds, cloneEntryWithNewIds, createCollection, createFolder, createRequest } from './factories';

function request(id: string) {
  return createRequest(`req-${id}`, () => id);
}

function folder(id: string, items: CollectionEntry[] = []): FolderModel {
  return { ...createFolder(`folder-${id}`, () => id), items };
}

function collection(id: string, items: CollectionEntry[]): Collection {
  return { ...createCollection(`col-${id}`, () => id), items };
}

function ids(items: CollectionEntry[]): string[] {
  return items.map((entry) => entry.id);
}

const sample = () =>
  collection('c1', [request('a'), folder('f1', [request('b'), folder('f2', [request('c')])]), request('d')]);

describe('lookup', () => {
  it('finds entries and parents recursively', () => {
    const { items } = sample();
    expect(findEntry(items, 'c')?.name).toBe('req-c');
    expect(findFolder(items, 'f2')?.items).toHaveLength(1);
    expect(findFolder(items, 'a')).toBeUndefined();
    expect(locateEntry([sample()], 'c')).toEqual({ collectionId: 'c1', parentFolderId: 'f2' });
    expect(locateEntry([sample()], 'a')).toEqual({ collectionId: 'c1', parentFolderId: undefined });
    expect(locateEntry([sample()], 'zzz')).toBeUndefined();
  });

  it('counts requests recursively and lists folder paths', () => {
    expect(countRequests(sample().items)).toBe(4);
    expect(listFolders(sample().items)).toEqual([
      { id: 'f1', path: 'folder-f1' },
      { id: 'f2', path: 'folder-f1 / folder-f2' },
    ]);
  });
});

describe('edits', () => {
  it('removes and renames nested entries without mutating the input', () => {
    const { items } = sample();
    expect(findEntry(removeEntry(items, 'c'), 'c')).toBeUndefined();
    expect(findEntry(renameEntry(items, 'c', 'new'), 'c')?.name).toBe('new');
    expect(findEntry(items, 'c')?.name).toBe('req-c');
  });

  it('removing a folder removes its descendants', () => {
    expect(ids(removeEntry(sample().items, 'f1'))).toEqual(['a', 'd']);
  });

  it('inserts a duplicate right after the original', () => {
    expect(ids(insertAfterEntry(sample().items, 'a', request('a2')))).toEqual(['a', 'a2', 'f1', 'd']);
  });
});

describe('moveEntry', () => {
  it('moves a request into a folder', () => {
    const [result] = moveEntry([sample()], 'a', { collectionId: 'c1', folderId: 'f2' });
    expect(ids(result.items)).toEqual(['f1', 'd']);
    expect(ids(findFolder(result.items, 'f2')!.items)).toEqual(['c', 'a']);
  });

  it('reorders within the same list before a sibling', () => {
    const [result] = moveEntry([sample()], 'd', { collectionId: 'c1', beforeEntryId: 'a' });
    expect(ids(result.items)).toEqual(['d', 'a', 'f1']);
  });

  it('reorders inside a folder', () => {
    const [result] = moveEntry([sample()], 'f2', { collectionId: 'c1', folderId: 'f1', beforeEntryId: 'b' });
    expect(ids(findFolder(result.items, 'f1')!.items)).toEqual(['f2', 'b']);
  });

  it('moves between collections and leaves untouched collections identical', () => {
    const other = collection('c2', [request('x')]);
    const bystander = collection('c3', []);
    const result = moveEntry([sample(), other, bystander], 'f1', { collectionId: 'c2', beforeEntryId: 'x' });
    expect(ids(result[0].items)).toEqual(['a', 'd']);
    expect(ids(result[1].items)).toEqual(['f1', 'x']);
    expect(countRequests(result[1].items)).toBe(3);
    expect(result[2]).toBe(bystander);
  });

  it('refuses to move a folder into itself or a descendant', () => {
    const collections = [sample()];
    expect(moveEntry(collections, 'f1', { collectionId: 'c1', folderId: 'f1' })).toBe(collections);
    expect(moveEntry(collections, 'f1', { collectionId: 'c1', folderId: 'f2' })).toBe(collections);
  });

  it('ignores unknown entries, folders and self-targeting drops', () => {
    const collections = [sample()];
    expect(moveEntry(collections, 'nope', { collectionId: 'c1' })).toBe(collections);
    expect(moveEntry(collections, 'a', { collectionId: 'nope' })).toBe(collections);
    expect(moveEntry(collections, 'a', { collectionId: 'c1', folderId: 'missing' })).toBe(collections);
    expect(moveEntry(collections, 'a', { collectionId: 'c1', beforeEntryId: 'a' })).toBe(collections);
  });

  it('appends when the reference sibling is missing', () => {
    const [result] = moveEntry([sample()], 'a', { collectionId: 'c1', beforeEntryId: 'gone' });
    expect(ids(result.items)).toEqual(['f1', 'd', 'a']);
  });
});

describe('cloning', () => {
  it('gives every nested entry a new id', () => {
    let next = 0;
    const clone = cloneEntryWithNewIds(sample().items[1], () => `n${next++}`) as FolderModel;
    expect(clone.id).toBe('n0');
    expect(ids(clone.items)).toEqual(['n1', 'n2']);
    expect(ids((clone.items[1] as FolderModel).items)).toEqual(['n3']);
  });

  it('remaps the active environment when cloning a collection', () => {
    const source = { ...sample(), environments: [{ id: 'e', name: 'dev', variables: [] }], activeEnvironmentId: 'e' };
    let next = 0;
    const clone = cloneCollectionWithNewIds(source, () => `n${next++}`);
    expect(clone.activeEnvironmentId).toBe(clone.environments[0].id);
    expect(clone.environments[0].id).not.toBe('e');
  });
});

describe('collectRequestIds', () => {
  it('lists request ids of nested entries, ignoring folder ids', () => {
    const entries = [request('a'), folder('f', [request('b'), folder('g', [request('c')])])];
    expect(collectRequestIds(entries)).toEqual(['a', 'b', 'c']);
  });
});


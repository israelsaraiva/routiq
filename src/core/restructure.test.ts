import { describe, expect, it } from 'vitest';
import { Collection, CollectionEntry, FolderModel } from '../shared/types';
import { findFolder } from './collectionTree';
import { createCollection, createFolder, createRequest } from './factories';
import { nestCollection, promoteFolder } from './restructure';

const request = (id: string) => createRequest(id, () => id);
const folder = (id: string, items: CollectionEntry[] = []): FolderModel => ({ ...createFolder(id, () => id), items });
const collection = (id: string, items: CollectionEntry[] = [], extra: Partial<Collection> = {}): Collection => ({
  ...createCollection(id, () => id),
  items,
  ...extra,
});
const counter = () => {
  let next = 0;
  return () => `new-${next++}`;
};

describe('nestCollection', () => {
  it('turns the collection into a folder at the end of the target and removes the source', () => {
    const result = nestCollection([collection('s', [request('r1'), folder('sub', [request('r2')])]), collection('t', [request('t1')])], 's', { collectionId: 't' });
    expect(result?.collections.map((c) => c.id)).toEqual(['t']);
    const target = result!.collections[0];
    expect(target.items.map((entry) => entry.id)).toEqual(['t1', 's']);
    expect(findFolder(target.items, 's')?.name).toBe('s');
    expect(findFolder(target.items, 'sub')).toBeDefined();
  });

  it('nests into a specific folder', () => {
    const result = nestCollection([collection('s'), collection('t', [folder('f')])], 's', { collectionId: 't', folderId: 'f' });
    expect(findFolder(result!.collections[0].items, 'f')?.items.map((entry) => entry.id)).toEqual(['s']);
  });

  it('guards against itself and unknown folders', () => {
    const collections = [collection('s'), collection('t')];
    expect(nestCollection(collections, 's', { collectionId: 's' })).toBeUndefined();
    expect(nestCollection(collections, 's', { collectionId: 't', folderId: 'missing' })).toBeUndefined();
    expect(nestCollection(collections, 'missing', { collectionId: 't' })).toBeUndefined();
  });

  it('regenerates ids that clash with the target', () => {
    const result = nestCollection([collection('s', [request('dup')]), collection('t', [request('dup')])], 's', { collectionId: 't' }, counter());
    const nested = findFolder(result!.collections[0].items, 's')!;
    expect(nested.items[0].id).toBe('new-0');
    expect(result!.collections[0].items[0].id).toBe('dup');
  });

  it('merges variables and environments without overwriting and moves secrets', () => {
    const source = collection('s', [], {
      variables: [
        { key: 'host', value: 'a', enabled: true },
        { key: 'token', value: '', enabled: true, secret: true },
        { key: 'clash', value: 'x', enabled: true },
      ],
      environments: [
        { id: 'se1', name: 'Dev', variables: [{ key: 'key', value: '', enabled: true, secret: true }] },
        { id: 'se2', name: 'Prod', variables: [{ key: 'url', value: 'p', enabled: true }] },
      ],
      activeEnvironmentId: 'se1',
    });
    const target = collection('t', [], {
      variables: [{ key: 'clash', value: 'y', enabled: true }],
      environments: [{ id: 'te1', name: 'dev', variables: [] }],
    });
    const result = nestCollection([source, target], 's', { collectionId: 't' }, counter())!;
    const merged = result.collections[0];
    expect(merged.variables.map((variable) => variable.key)).toEqual(['clash', 'host', 'token']);
    expect(merged.variables[0].value).toBe('y');
    expect(merged.environments.map((environment) => environment.id)).toEqual(['te1', 'new-0']);
    expect(merged.environments[0].variables.map((variable) => variable.key)).toEqual(['key']);
    expect(result.secretMoves).toEqual([
      { from: { scope: 'base', name: 'token' }, to: { scope: 'base', name: 'token' } },
      { from: { scope: 'se1', name: 'key' }, to: { scope: 'te1', name: 'key' } },
    ]);
    expect(result.warnings.some((warning) => warning.includes('"clash"'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('active environment'))).toBe(true);
    expect(JSON.stringify(result.collections)).not.toContain('secret-value');
  });
});

describe('promoteFolder', () => {
  it('creates a top-level collection right after the source with the folder contents', () => {
    const collections = [collection('a', [folder('f', [request('r')]), request('keep')]), collection('b')];
    const result = promoteFolder(collections, 'f', counter())!;
    expect(result.collections.map((c) => c.id)).toEqual(['a', 'new-0', 'b']);
    expect(result.promoted.name).toBe('f');
    expect(result.promoted.items.map((entry) => entry.id)).toEqual(['r']);
    expect(result.collections[0].items.map((entry) => entry.id)).toEqual(['keep']);
  });

  it('returns undefined for unknown folders', () => {
    expect(promoteFolder([collection('a')], 'nope')).toBeUndefined();
  });
});

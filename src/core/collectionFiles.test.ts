import { promises as fs } from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CollectionFileStore } from './collectionFiles';
import { createCollection, createRequest } from './factories';

const scratchRoot = path.join(__dirname, '..', '..', '.test-scratch');
let directory: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(await ensureRoot(), 'store-'));
});

afterEach(async () => {
  await fs.rm(scratchRoot, { recursive: true, force: true });
});

async function ensureRoot(): Promise<string> {
  await fs.mkdir(scratchRoot, { recursive: true });
  return scratchRoot;
}

function sampleCollection(name: string, id: string) {
  const collection = createCollection(name, () => id);
  collection.items.push({ ...createRequest('Get', () => `${id}-r`), url: 'http://x' });
  return collection;
}

describe('CollectionFileStore', () => {
  it('writes one slug-named file per collection and loads them back with ids intact', async () => {
    const store = new CollectionFileStore(directory);
    await store.save(sampleCollection('My API', 'id-1'));
    await store.save(sampleCollection('Other', 'id-2'));
    expect((await fs.readdir(directory)).sort()).toEqual(['my-api.json', 'other.json']);

    const loaded = await new CollectionFileStore(directory).loadAll();
    expect(loaded.map((c) => c.id).sort()).toEqual(['id-1', 'id-2']);
    expect(loaded.find((c) => c.id === 'id-1')?.items[0]).toMatchObject({ id: 'id-1-r', url: 'http://x' });
  });

  it('keeps the file name on rename and disambiguates slug clashes', async () => {
    const store = new CollectionFileStore(directory);
    const first = sampleCollection('Same', 'aaaaaaaa-1');
    await store.save(first);
    await store.save(sampleCollection('Same', 'bbbbbbbb-2'));
    await store.save({ ...first, name: 'Renamed' });
    expect((await fs.readdir(directory)).sort()).toEqual(['same-bbbbbbbb.json', 'same.json']);
  });

  it('removes the file, leaves no temp files, and ignores invalid json', async () => {
    const store = new CollectionFileStore(directory);
    await store.save(sampleCollection('Gone', 'id-1'));
    await fs.writeFile(path.join(directory, 'broken.json'), '{nope', 'utf8');
    await store.remove('id-1');
    expect(await fs.readdir(directory)).toEqual(['broken.json']);
    expect(await store.loadAll()).toEqual([]);
  });

  it('loads legacy flat files and migrates them to items on the next save', async () => {
    const legacy = {
      id: 'old-1',
      name: 'Legacy',
      variables: [{ key: 'host', value: 'x', enabled: true }],
      requests: [{ id: 'old-r', name: 'R', method: 'GET', url: 'u', params: [], headers: [], body: { type: 'none', text: '', form: [] }, auth: { type: 'none' } }],
    };
    await fs.writeFile(path.join(directory, 'legacy.json'), JSON.stringify(legacy), 'utf8');
    const store = new CollectionFileStore(directory);
    const [loaded] = await store.loadAll();
    expect(loaded.items).toMatchObject([{ id: 'old-r', name: 'R' }]);
    expect(loaded.variables).toEqual([{ key: 'host', value: 'x', enabled: true }]);
    expect(loaded.environments).toEqual([]);

    await store.save(loaded);
    const rewritten = JSON.parse(await fs.readFile(path.join(directory, 'legacy.json'), 'utf8'));
    expect(rewritten.version).toBe(2);
    expect(rewritten.requests).toBeUndefined();
    expect(rewritten.items[0].id).toBe('old-r');
  });

  it('keeps folder, environment and active environment ids stable across a round trip', async () => {
    const store = new CollectionFileStore(directory);
    const collection = createCollection('Nested', () => 'n1');
    collection.items.push({ id: 'folder-1', name: 'F', items: [createRequest('Deep', () => 'deep-1')] });
    collection.environments.push({ id: 'env-1', name: 'prod', variables: [] });
    collection.activeEnvironmentId = 'env-1';
    await store.save(collection);
    const [loaded] = await new CollectionFileStore(directory).loadAll();
    expect(loaded).toEqual(collection);
  });
});

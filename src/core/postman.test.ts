import { describe, expect, it } from 'vitest';
import { buildExportFile, parseImportedCollections } from './postman';
import { FolderModel, RequestModel } from '../shared/types';
import { createCollection, createRequest } from './factories';

const counter = () => {
  let next = 0;
  return () => `id-${next++}`;
};

const postmanCollection = {
  info: { name: 'Pets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'Create',
      request: {
        method: 'post',
        url: { raw: 'http://x/pets' },
        header: [{ key: 'X-A', value: '1' }, { key: 'X-B', value: '2', disabled: true }],
        body: { mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } },
      },
    },
    { name: 'Folder', item: [{ name: 'List', request: { method: 'GET', url: 'http://x/pets' } }] },
  ],
};

describe('parseImportedCollections', () => {
  it('imports Postman v2.1 requests and keeps nested folders', () => {
    const [collection] = parseImportedCollections(postmanCollection, counter());
    expect(collection.name).toBe('Pets');
    expect(collection.items.map((entry) => entry.name)).toEqual(['Create', 'Folder']);
    const folder = collection.items[1] as FolderModel;
    expect(folder.items.map((entry) => entry.name)).toEqual(['List']);
    const [create] = collection.items as RequestModel[];
    expect(create.method).toBe('POST');
    expect(create.url).toBe('http://x/pets');
    expect(create.headers).toEqual([
      { key: 'X-A', value: '1', enabled: true },
      { key: 'X-B', value: '2', enabled: false },
    ]);
    expect(create.body).toEqual({ type: 'json', text: '{"a":1}', form: [] });
  });

  it('regenerates ids when importing the own format', () => {
    const source = createCollection('C', () => 'old');
    source.items.push(createRequest('R', () => 'old'));
    const [imported] = parseImportedCollections(buildExportFile([source]), counter());
    expect(imported.id).toBe('id-0');
    expect(imported.items[0].id).toBe('id-1');
    expect(imported.items[0].name).toBe('R');
  });

  it('imports deeply nested and empty Postman folders', () => {
    const [collection] = parseImportedCollections(
      { info: { name: 'N' }, item: [{ name: 'A', item: [{ name: 'B', item: [{ name: 'Deep', request: { method: 'GET', url: 'u' } }] }, { name: 'Empty', item: [] }] }] },
      counter(),
    );
    const folderA = collection.items[0] as FolderModel;
    const folderB = folderA.items[0] as FolderModel;
    expect(folderB.items.map((entry) => entry.name)).toEqual(['Deep']);
    expect((folderA.items[1] as FolderModel).items).toEqual([]);
  });

  it('round-trips folders and environments through the own export format with fresh ids', () => {
    const source = createCollection('C', () => 'c');
    source.items.push({ id: 'f', name: 'F', items: [createRequest('Inner', () => 'r')] });
    source.environments.push({ id: 'e1', name: 'dev', variables: [{ key: 'a', value: '1', enabled: true }] });
    source.activeEnvironmentId = 'e1';
    const [imported] = parseImportedCollections(JSON.parse(JSON.stringify(buildExportFile([source]))), counter());
    const folder = imported.items[0] as FolderModel;
    expect(folder.name).toBe('F');
    expect(folder.id).not.toBe('f');
    expect(folder.items[0].name).toBe('Inner');
    expect(imported.environments[0].variables).toEqual([{ key: 'a', value: '1', enabled: true }]);
    expect(imported.activeEnvironmentId).toBe(imported.environments[0].id);
    expect(imported.environments[0].id).not.toBe('e1');
  });

  it('imports legacy version 1 exports with a flat requests list', () => {
    const legacy = {
      version: 1,
      collections: [{ id: 'x', name: 'Old', variables: [{ key: 'k', value: 'v', enabled: true }], requests: [{ id: 'r', name: 'R', method: 'POST', url: 'u' }] }],
    };
    const [imported] = parseImportedCollections(legacy, counter());
    expect(imported.variables).toEqual([{ key: 'k', value: 'v', enabled: true }]);
    expect(imported.environments).toEqual([]);
    expect(imported.items).toMatchObject([{ name: 'R', method: 'POST' }]);
  });

  it('imports a single collection file shape', () => {
    const [imported] = parseImportedCollections({ version: 2, id: 'x', name: 'Single', items: [] }, counter());
    expect(imported.name).toBe('Single');
  });

  it('rejects unknown formats', () => {
    expect(() => parseImportedCollections({ foo: 1 })).toThrow();
    expect(() => parseImportedCollections('x')).toThrow();
  });
});

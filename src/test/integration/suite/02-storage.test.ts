import * as assert from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { Collection, CollectionEntry, FolderModel, RequestModel } from '../../../shared/types';
import { SecretVault } from '../../../extension/secretVault';
import { InMemorySecrets } from '../inMemorySecrets';
import { Storage } from '../../../extension/storage';
import { buildExportFile } from '../../../core/postman';
import { buildPostmanExport } from '../../../core/postmanExport';
import { importFromText } from '../../../extension/importExport';
import { scratchRoot } from '../scratch';
import { StorageHarness, collectionFiles, createStorageHarness, readCollectionFile, useStoragePath } from '../storageHarness';
import { waitFor } from '../waiting';

const WATCHER_REGISTRATION_DELAY_MS = 1000;

const isFolder = (entry: CollectionEntry): entry is FolderModel => 'items' in entry;

function shapeOf(entries: CollectionEntry[]): unknown[] {
  return entries.map((entry) => (isFolder(entry) ? { folder: entry.name, items: shapeOf(entry.items) } : { request: entry.name, method: entry.method, url: entry.url }));
}

describe('Storage', () => {
  let harness: StorageHarness;
  let vault: SecretVault;
  const disposables: Storage[] = [];

  beforeEach(async () => {
    harness = await createStorageHarness('storage');
    disposables.push(harness.storage);
    vault = new SecretVault(new InMemorySecrets());
  });

  afterEach(async () => {
    vault.dispose();
    await vscode.commands.executeCommand('notifications.clearAll');
    disposables.splice(0).forEach((storage) => storage.dispose());
    await useStoragePath(join(scratchRoot(), 'configured-storage'));
  });

  it('writes collection, folder and request into the configured storagePath', async () => {
    const collection = harness.storage.addCollection('My API');
    const folder = harness.storage.addFolder(collection.id, 'Users');
    const request = harness.storage.addRequest(collection.id, 'List users', folder?.id);
    assert.ok(folder && request);
    await harness.storage.flush();

    assert.strictEqual(harness.storage.directory, harness.directory);
    const files = collectionFiles(harness.directory);
    assert.strictEqual(files.length, 1);
    const content = readCollectionFile(harness.directory, files[0]);
    assert.ok(content.includes('My API') && content.includes('Users') && content.includes('List users'));
  });

  it('persists updates and reloads them from disk', async () => {
    const collection = harness.storage.addCollection('Persisted');
    const request = harness.storage.addRequest(collection.id, 'Ping');
    assert.ok(request);
    harness.storage.updateRequest({ ...request, url: 'http://example.test/ping', method: 'POST' });
    harness.storage.renameCollection(collection.id, 'Persisted v2');
    await harness.storage.flush();

    const reloaded = new Storage(harness.globalStorage);
    disposables.push(reloaded);
    await reloaded.init();
    const [loaded] = reloaded.getCollections();
    assert.strictEqual(loaded.name, 'Persisted v2');
    assert.deepStrictEqual(shapeOf(loaded.items), [{ request: 'Ping', method: 'POST', url: 'http://example.test/ping' }]);
  });

  it('removes the file when a collection is deleted and when entries are removed', async () => {
    const collection = harness.storage.addCollection('Doomed');
    const request = harness.storage.addRequest(collection.id, 'Gone soon');
    assert.ok(request);
    harness.storage.deleteEntry(request.id);
    await harness.storage.flush();
    assert.ok(!readCollectionFile(harness.directory, collectionFiles(harness.directory)[0]).includes('Gone soon'));

    harness.storage.deleteCollection(collection.id);
    await harness.storage.flush();
    assert.deepStrictEqual(collectionFiles(harness.directory), []);
  });

  it('resolves a relative storagePath against the first workspace folder', async () => {
    await useStoragePath('.routiq-relative');
    const relative = new Storage(harness.globalStorage);
    disposables.push(relative);
    await relative.init();
    const workspaceFolder = await waitFor(() => vscode.workspace.workspaceFolders?.[0], 'workspace folder', 15000);
    assert.strictEqual(relative.directory, join(workspaceFolder.uri.fsPath, '.routiq-relative'));
    relative.addCollection('Relative');
    await relative.flush();
    assert.ok(existsSync(join(workspaceFolder.uri.fsPath, '.routiq-relative')));
  });

  it('relocates when the storagePath setting changes', async () => {
    harness.storage.addCollection('Before move');
    await harness.storage.flush();
    const moved = join(scratchRoot(), 'work', 'moved-storage');
    await useStoragePath(moved);
    await waitFor(() => harness.storage.directory === moved || undefined, 'storage relocation');
    assert.deepStrictEqual(harness.storage.getCollections(), []);
  });

  it('picks up collection files changed on disk by another process', async () => {
    const other = new Storage(harness.globalStorage);
    disposables.push(other);
    await other.init();
    await new Promise((resolve) => setTimeout(resolve, WATCHER_REGISTRATION_DELAY_MS));
    other.addCollection('From elsewhere');
    await other.flush();
    await waitFor(() => harness.storage.getCollections().find((collection) => collection.name === 'From elsewhere'), 'external reload', 10000);
  });

  describe('export and import', () => {
    function seed(): Collection {
      const collection = harness.storage.addCollection('Round trip');
      const folder = harness.storage.addFolder(collection.id, 'Folder');
      const request = harness.storage.addRequest(collection.id, 'Nested', folder?.id) as RequestModel;
      harness.storage.updateRequest({ ...request, url: 'http://example.test/nested', method: 'PUT', headers: [{ key: 'X-A', value: '1', enabled: true }] });
      harness.storage.addRequest(collection.id, 'Top');
      return harness.storage.getCollection(collection.id) as Collection;
    }

    it('round-trips the native export format with fresh ids', async () => {
      const original = seed();
      const exported = JSON.stringify(buildExportFile([original]));
      const before = harness.storage.getCollections().length;
      void importFromText(harness.storage, vault, exported, () => undefined);
      await waitFor(() => harness.storage.getCollections().length > before || undefined, 'imported collection');
      await harness.storage.flush();

      const collections = harness.storage.getCollections();
      assert.strictEqual(collections.length, before + 1);
      const imported = collections[collections.length - 1];
      assert.notStrictEqual(imported.id, original.id);
      assert.deepStrictEqual(shapeOf(imported.items), shapeOf(original.items));
      assert.deepStrictEqual((imported.items.find((entry) => isFolder(entry)) as FolderModel).items.map((entry) => (entry as RequestModel).headers), [
        [{ key: 'X-A', value: '1', enabled: true }],
      ]);
      assert.strictEqual(collectionFiles(harness.directory).length, 2);
    });

    it('round-trips through the Postman v2.1 export', async () => {
      const original = seed();
      const exported = JSON.stringify(buildPostmanExport(original));

      const before = harness.storage.getCollections().length;
      void importFromText(harness.storage, vault, exported, () => undefined);
      await waitFor(() => harness.storage.getCollections().length > before || undefined, 'imported collection');
      await harness.storage.flush();

      const imported = harness.storage.getCollections()[harness.storage.getCollections().length - 1];
      assert.strictEqual(imported.name, original.name);
      assert.deepStrictEqual(shapeOf(imported.items), shapeOf(original.items));
    });
  });
});

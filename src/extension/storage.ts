import * as vscode from 'vscode';
import { CollectionFileStore } from '../core/collectionFiles';
import { SortDirection, appendCollection, moveCollection, sortCollections, withSequentialOrder } from '../core/collectionOrder';
import {
  Destination, collectRequestIds, findEntry, findFolder, findRequest, insertAfterEntry, insertEntry, moveEntry, removeEntry, renameEntry, replaceRequest,
} from '../core/collectionTree';
import { EntrySortMode, sortFolderItems } from '../core/entrySorting';
import { applyEnvironmentsDraft, sanitizeActiveEnvironmentId } from '../core/environments';
import { cloneCollectionWithNewIds, cloneEntryWithNewIds, createCollection, createFolder, createRequest } from '../core/factories';
import { NestResult, PromoteResult, promoteFolder } from '../core/restructure';
import { applyVariableChanges } from '../core/scriptFlow';
import { serializeCollection } from '../core/serialization';
import { Collection, EnvironmentsDraft, FolderModel, RequestKind, RequestModel } from '../shared/types';
import { resolveStorageDirectory } from './storagePath';

const EXTERNAL_CHANGE_DEBOUNCE_MS = 200;

export interface RequestLocation {
  collection: Collection;
  request: RequestModel;
}

export interface FolderLocation {
  collection: Collection;
  folder: FolderModel;
}

export class Storage implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private readonly requestsDeletedEmitter = new vscode.EventEmitter<string[]>();
  readonly onDidDeleteRequests = this.requestsDeletedEmitter.event;
  private readonly collectionDeletedEmitter = new vscode.EventEmitter<string>();
  readonly onDidDeleteCollection = this.collectionDeletedEmitter.event;

  private collections: Collection[] = [];
  private fileStore: CollectionFileStore;
  private watcher: vscode.FileSystemWatcher | undefined;
  private reloadTimer: NodeJS.Timeout | undefined;
  private pendingWrites = Promise.resolve();
  private pendingWriteCount = 0;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly globalStorageDirectory: string) {
    this.fileStore = new CollectionFileStore(resolveStorageDirectory(globalStorageDirectory));
    this.disposables.push(
      this.changeEmitter,
      this.requestsDeletedEmitter,
      this.collectionDeletedEmitter,
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('routiq.storagePath')) {
          void this.relocate();
        }
      }),
    );
  }

  get directory(): string {
    return this.fileStore.directory;
  }

  async init(): Promise<void> {
    await this.loadFromDisk();
    this.startWatching();
  }

  getCollections(): Collection[] {
    return this.collections;
  }

  getCollection(collectionId: string): Collection | undefined {
    return this.collections.find((collection) => collection.id === collectionId);
  }

  findRequest(requestId: string): RequestLocation | undefined {
    for (const collection of this.collections) {
      const request = findRequest(collection.items, requestId);
      if (request) {
        return { collection, request };
      }
    }
    return undefined;
  }

  findFolder(folderId: string): FolderLocation | undefined {
    for (const collection of this.collections) {
      const folder = findFolder(collection.items, folderId);
      if (folder) {
        return { collection, folder };
      }
    }
    return undefined;
  }

  findCollectionOfEntry(entryId: string): Collection | undefined {
    return this.collections.find((collection) => findEntry(collection.items, entryId) !== undefined);
  }

  addCollection(name: string): Collection {
    return this.appendNewCollection(createCollection(name));
  }

  renameCollection(collectionId: string, name: string): void {
    this.replaceCollection(collectionId, (collection) => ({ ...collection, name }));
  }

  deleteCollection(collectionId: string): void {
    const removedRequestIds = collectRequestIds(this.getCollection(collectionId)?.items ?? []);
    this.collections = this.collections.filter((collection) => collection.id !== collectionId);
    this.enqueueWrite(() => this.fileStore.remove(collectionId));
    this.changeEmitter.fire();
    this.requestsDeletedEmitter.fire(removedRequestIds);
    this.collectionDeletedEmitter.fire(collectionId);
  }

  duplicateCollection(collectionId: string): Collection | undefined {
    const source = this.getCollection(collectionId);
    if (!source) {
      return undefined;
    }
    const copy = { ...cloneCollectionWithNewIds(source), name: `${source.name} copy` };
    return this.appendNewCollection(copy);
  }

  applyEnvironmentsDraft(collectionId: string, draft: EnvironmentsDraft): void {
    this.replaceCollection(collectionId, (collection) => applyEnvironmentsDraft(collection, draft));
  }

  writeScriptVariables(collectionId: string, changes: Record<string, string>): void {
    if (Object.keys(changes).length > 0) {
      this.replaceCollection(collectionId, (collection) => applyVariableChanges(collection, changes));
    }
  }

  setActiveEnvironment(collectionId: string, environmentId?: string): void {
    this.replaceCollection(collectionId, (collection) => {
      const activeEnvironmentId = sanitizeActiveEnvironmentId(collection.environments, environmentId);
      const { activeEnvironmentId: _previous, ...rest } = collection;
      return activeEnvironmentId ? { ...rest, activeEnvironmentId } : rest;
    });
  }

  addRequest(collectionId: string, name: string, folderId?: string, kind?: RequestKind): RequestModel | undefined {
    const request = createRequest(name, undefined, kind);
    return this.addEntry(collectionId, request, folderId) ? request : undefined;
  }

  addRequestFrom(collectionId: string, request: RequestModel, folderId?: string): RequestModel | undefined {
    return this.addEntry(collectionId, request, folderId) ? request : undefined;
  }

  addFolder(collectionId: string, name: string, folderId?: string): FolderModel | undefined {
    const folder = createFolder(name);
    return this.addEntry(collectionId, folder, folderId) ? folder : undefined;
  }

  updateRequest(updated: RequestModel): void {
    const location = this.findRequest(updated.id);
    if (location) {
      this.replaceCollection(location.collection.id, (collection) => ({ ...collection, items: replaceRequest(collection.items, updated) }));
    }
  }

  renameEntry(entryId: string, name: string): void {
    const collection = this.findCollectionOfEntry(entryId);
    if (collection) {
      this.replaceCollection(collection.id, (current) => ({ ...current, items: renameEntry(current.items, entryId, name) }));
    }
  }

  deleteEntry(entryId: string): void {
    const collection = this.findCollectionOfEntry(entryId);
    const removed = collection && findEntry(collection.items, entryId);
    if (collection && removed) {
      this.replaceCollection(collection.id, (current) => ({ ...current, items: removeEntry(current.items, entryId) }));
      this.requestsDeletedEmitter.fire(collectRequestIds([removed]));
    }
  }

  duplicateEntry(entryId: string): void {
    const collection = this.findCollectionOfEntry(entryId);
    const entry = collection && findEntry(collection.items, entryId);
    if (!collection || !entry) {
      return;
    }
    const copy = { ...cloneEntryWithNewIds(entry), name: `${entry.name} copy` };
    this.replaceCollection(collection.id, (current) => ({ ...current, items: insertAfterEntry(current.items, entryId, copy) }));
  }

  moveEntry(entryId: string, destination: Destination): void {
    this.replaceCollections(moveEntry(this.collections, entryId, destination));
  }

  sortEntries(collectionId: string, folderId: string | undefined, mode: EntrySortMode, recursive: boolean): void {
    this.replaceCollection(collectionId, (collection) => ({ ...collection, items: sortFolderItems(collection.items, folderId, mode, recursive) }));
  }

  moveCollection(collectionId: string, beforeCollectionId?: string): void {
    this.replaceCollections(moveCollection(this.collections, collectionId, beforeCollectionId));
  }

  sortCollections(direction: SortDirection): void {
    this.replaceCollections(sortCollections(this.collections, direction));
  }

  applyNest(result: NestResult): void {
    this.replaceCollections(result.collections);
    this.enqueueWrite(() => this.fileStore.remove(result.sourceCollectionId));
    this.collectionDeletedEmitter.fire(result.sourceCollectionId);
  }

  promoteFolder(folderId: string): Collection | undefined {
    const result: PromoteResult | undefined = promoteFolder(this.collections, folderId);
    if (!result) {
      return undefined;
    }
    this.replaceCollections(withSequentialOrder(result.collections));
    return this.getCollection(result.promoted.id);
  }

  importCollections(imported: Collection[]): void {
    for (const collection of imported) {
      this.collections = appendCollection(this.collections, collection);
      const stored = this.collections[this.collections.length - 1];
      this.enqueueWrite(() => this.fileStore.save(stored));
    }
    this.changeEmitter.fire();
  }

  flush(): Promise<void> {
    return this.pendingWrites;
  }

  dispose(): void {
    clearTimeout(this.reloadTimer);
    this.watcher?.dispose();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private appendNewCollection(collection: Collection): Collection {
    this.collections = appendCollection(this.collections, collection);
    const stored = this.collections[this.collections.length - 1];
    this.commit(stored);
    return stored;
  }

  private replaceCollections(updated: Collection[]): void {
    if (updated === this.collections) {
      return;
    }
    const previous = new Set(this.collections);
    this.collections = updated;
    updated.filter((collection) => !previous.has(collection)).forEach((collection) => this.enqueueWrite(() => this.fileStore.save(collection)));
    this.changeEmitter.fire();
  }

  private addEntry(collectionId: string, entry: RequestModel | FolderModel, folderId?: string): boolean {
    const target = this.getCollection(collectionId);
    if (!target || (folderId !== undefined && !findFolder(target.items, folderId))) {
      return false;
    }
    return this.replaceCollection(collectionId, (collection) => ({ ...collection, items: insertEntry(collection.items, entry, folderId) }));
  }

  private replaceCollection(collectionId: string, transform: (collection: Collection) => Collection): boolean {
    const index = this.collections.findIndex((collection) => collection.id === collectionId);
    if (index === -1) {
      return false;
    }
    const updated = transform(this.collections[index]);
    this.collections = this.collections.map((collection, position) => (position === index ? updated : collection));
    this.commit(updated);
    return true;
  }

  private commit(collection: Collection): void {
    this.enqueueWrite(() => this.fileStore.save(collection));
    this.changeEmitter.fire();
  }

  private enqueueWrite(write: () => Promise<void>): void {
    this.pendingWriteCount++;
    this.pendingWrites = this.pendingWrites
      .then(write)
      .catch((error) => vscode.window.showErrorMessage(`Routiq: failed to write collection (${error})`))
      .then(() => {
        this.pendingWriteCount--;
      });
  }

  private async loadFromDisk(): Promise<void> {
    const loaded = await this.fileStore.loadAll();
    if (this.snapshot(loaded) !== this.snapshot(this.collections)) {
      this.collections = loaded;
      this.changeEmitter.fire();
    }
  }

  private snapshot(collections: Collection[]): string {
    return collections.map(serializeCollection).sort().join('');
  }

  private startWatching(): void {
    this.watcher?.dispose();
    const pattern = new vscode.RelativePattern(vscode.Uri.file(this.fileStore.directory), '*.json');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const scheduleReload = () => this.scheduleExternalReload();
    this.watcher.onDidCreate(scheduleReload);
    this.watcher.onDidChange(scheduleReload);
    this.watcher.onDidDelete(scheduleReload);
  }

  private scheduleExternalReload(): void {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => void this.reloadUnlessWriting(), EXTERNAL_CHANGE_DEBOUNCE_MS);
  }

  private async reloadUnlessWriting(): Promise<void> {
    if (this.pendingWriteCount > 0) {
      this.scheduleExternalReload();
      return;
    }
    await this.loadFromDisk();
  }

  private async relocate(): Promise<void> {
    await this.flush();
    this.fileStore = new CollectionFileStore(resolveStorageDirectory(this.globalStorageDirectory));
    this.collections = [];
    await this.init();
    this.changeEmitter.fire();
  }
}

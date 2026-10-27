import * as vscode from 'vscode';
import { Collection, EnvironmentsDraft } from '../shared/types';
import {
  SecretLookup, collectionSecretPrefix, extractDraftSecrets, hydrateCollection, hydrateEnvironments, listSecretRefs, secretStorageKey, staleSecretRefs,
} from '../core/secrets';
import { SecretMove } from '../core/restructure';

export class SecretVault implements vscode.Disposable {
  private readonly cache = new Map<string, string>();
  private readonly subscription: vscode.Disposable;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.subscription = secrets.onDidChange(({ key }) => this.refreshIfCached(key));
  }

  async load(collections: Collection[]): Promise<void> {
    for (const collection of collections) {
      for (const ref of listSecretRefs(collection)) {
        await this.fetch(secretStorageKey(collection.id, ref));
      }
    }
  }

  hydrate(collection: Collection): Collection {
    return hydrateCollection(collection, this.lookupFor(collection.id));
  }

  async hydrateDraft(collectionId: string, draft: EnvironmentsDraft): Promise<EnvironmentsDraft> {
    await this.load([{ ...draft, id: collectionId, name: '', items: [] }]);
    return hydrateEnvironments(draft, this.lookupFor(collectionId));
  }

  async saveDraft(collection: Collection, draft: EnvironmentsDraft): Promise<void> {
    for (const { value, ...ref } of extractDraftSecrets(draft)) {
      await this.store(secretStorageKey(collection.id, ref), value);
    }
    for (const ref of staleSecretRefs(listSecretRefs(collection), listSecretRefs(draft))) {
      await this.remove(secretStorageKey(collection.id, ref));
    }
  }

  async moveSecrets(fromCollectionId: string, toCollectionId: string, moves: SecretMove[]): Promise<void> {
    for (const { from, to } of moves) {
      const sourceKey = secretStorageKey(fromCollectionId, from);
      await this.fetch(sourceKey);
      const value = this.cache.get(sourceKey);
      value !== undefined && (await this.store(secretStorageKey(toCollectionId, to), value));
    }
  }

  async discardCollection(collectionId: string): Promise<void> {
    const prefix = collectionSecretPrefix(collectionId);
    for (const key of [...this.cache.keys()].filter((cached) => cached.startsWith(prefix))) {
      await this.remove(key);
    }
  }

  dispose(): void {
    this.subscription.dispose();
  }

  private lookupFor(collectionId: string): SecretLookup {
    return (scope, name) => this.cache.get(secretStorageKey(collectionId, { scope, name }));
  }

  private async store(key: string, value: string): Promise<void> {
    if (value === '') {
      await this.remove(key);
      return;
    }
    await this.secrets.store(key, value);
    this.cache.set(key, value);
  }

  private async remove(key: string): Promise<void> {
    await this.secrets.delete(key);
    this.cache.delete(key);
  }

  private async fetch(key: string): Promise<void> {
    const value = await this.secrets.get(key);
    if (value === undefined) {
      this.cache.delete(key);
    } else {
      this.cache.set(key, value);
    }
  }

  private refreshIfCached(key: string): void {
    if (this.cache.has(key)) {
      void this.fetch(key);
    }
  }
}

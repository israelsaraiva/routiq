import { promises as fs } from 'fs';
import * as path from 'path';
import { Collection } from '../shared/types';
import { orderCollections } from './collectionOrder';
import { parseOwnCollection } from './collectionFormat';
import { generateId } from './ids';
import { serializeCollection, slugify } from './serialization';

const COLLECTION_EXTENSION = '.json';

function isCollectionFile(fileName: string): boolean {
  return fileName.endsWith(COLLECTION_EXTENSION);
}

function keepExistingId(existingId: unknown): string {
  return typeof existingId === 'string' && existingId !== '' ? existingId : generateId();
}

export class CollectionFileStore {
  private readonly fileNamesById = new Map<string, string>();

  constructor(readonly directory: string) {}

  async loadAll(): Promise<Collection[]> {
    await fs.mkdir(this.directory, { recursive: true });
    this.fileNamesById.clear();
    const fileNames = (await fs.readdir(this.directory)).filter(isCollectionFile).sort();
    const loaded = await Promise.all(fileNames.map((fileName) => this.loadFile(fileName)));
    return orderCollections(loaded.filter((collection): collection is Collection => collection !== undefined));
  }

  async save(collection: Collection): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const filePath = path.join(this.directory, this.fileNameFor(collection));
    await this.writeAtomically(filePath, serializeCollection(collection));
  }

  async remove(collectionId: string): Promise<void> {
    const fileName = this.fileNamesById.get(collectionId);
    if (!fileName) {
      return;
    }
    this.fileNamesById.delete(collectionId);
    await fs.rm(path.join(this.directory, fileName), { force: true });
  }

  fileNameFor(collection: Collection): string {
    const existing = this.fileNamesById.get(collection.id);
    if (existing) {
      return existing;
    }
    const fileName = this.pickFreeFileName(collection);
    this.fileNamesById.set(collection.id, fileName);
    return fileName;
  }

  private pickFreeFileName(collection: Collection): string {
    const taken = new Set(this.fileNamesById.values());
    const slug = slugify(collection.name);
    const candidates = [`${slug}${COLLECTION_EXTENSION}`, `${slug}-${collection.id.slice(0, 8)}${COLLECTION_EXTENSION}`];
    return candidates.find((candidate) => !taken.has(candidate)) ?? `${collection.id}${COLLECTION_EXTENSION}`;
  }

  private async loadFile(fileName: string): Promise<Collection | undefined> {
    try {
      const text = await fs.readFile(path.join(this.directory, fileName), 'utf8');
      const raw = JSON.parse(text);
      if (typeof raw?.id !== 'string' || raw.id === '') {
        return undefined;
      }
      this.fileNamesById.set(raw.id, fileName);
      return parseOwnCollection(raw, keepExistingId);
    } catch {
      return undefined;
    }
  }

  private async writeAtomically(filePath: string, content: string): Promise<void> {
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, content, 'utf8');
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

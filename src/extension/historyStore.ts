import { promises as fs } from 'fs';
import * as path from 'path';
import { addEntry, removeEntry } from '../core/history';
import { HistoryEntry } from '../shared/types';

export class HistoryStore {
  private readonly directory: string;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(storageRoot: string) {
    this.directory = path.join(storageRoot, 'history');
  }

  list(requestId: string): Promise<HistoryEntry[]> {
    return this.enqueue(requestId, () => this.read(requestId));
  }

  record(requestId: string, entry: HistoryEntry, maxEntries: number): Promise<HistoryEntry[]> {
    return this.update(requestId, (entries) => addEntry(entries, entry, maxEntries));
  }

  remove(requestId: string, entryId: string): Promise<HistoryEntry[]> {
    return this.update(requestId, (entries) => removeEntry(entries, entryId));
  }

  clear(requestId: string): Promise<void> {
    return this.enqueue(requestId, () => fs.rm(this.fileFor(requestId), { force: true }));
  }

  async clearAll(): Promise<void> {
    await fs.rm(this.directory, { recursive: true, force: true });
  }

  private update(requestId: string, change: (entries: HistoryEntry[]) => HistoryEntry[]): Promise<HistoryEntry[]> {
    return this.enqueue(requestId, async () => {
      const updated = change(await this.read(requestId));
      await this.write(requestId, updated);
      return updated;
    });
  }

  private enqueue<T>(requestId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(requestId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(requestId, next.catch(() => undefined));
    return next;
  }

  private fileFor(requestId: string): string {
    return path.join(this.directory, `${encodeURIComponent(requestId)}.json`);
  }

  private async read(requestId: string): Promise<HistoryEntry[]> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.fileFor(requestId), 'utf8'));
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  private async write(requestId: string, entries: HistoryEntry[]): Promise<void> {
    const target = this.fileFor(requestId);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(entries), 'utf8');
    await fs.rename(temporary, target);
  }
}

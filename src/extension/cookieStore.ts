import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Cookie, CookieJar, buildCookieHeader, cookiesForUrl, pruneExpired, removeCookie, storeResponseCookies } from '../core/cookies';
import { CookieSession } from './httpClient';

export class CookieStore {
  private readonly jars = new Map<string, CookieJar>();
  private readonly directory: string;

  constructor(globalStoragePath: string) {
    this.directory = join(globalStoragePath, 'cookies');
  }

  async load(collectionId: string): Promise<void> {
    if (!this.jars.has(collectionId)) {
      this.jars.set(collectionId, await this.readJar(collectionId));
    }
  }

  async sessionFor(collectionId: string): Promise<CookieSession> {
    await this.load(collectionId);
    return {
      headerFor: (url) => buildCookieHeader(cookiesForUrl(this.jarOf(collectionId), url, Date.now())),
      store: (url, setCookieHeaders) => this.updateJar(collectionId, storeResponseCookies(this.jarOf(collectionId), setCookieHeaders, url, Date.now())),
    };
  }

  async list(collectionId: string): Promise<Cookie[]> {
    await this.load(collectionId);
    return pruneExpired(this.jarOf(collectionId), Date.now());
  }

  async remove(collectionId: string, cookies: Cookie[]): Promise<void> {
    await this.load(collectionId);
    const remaining = cookies.reduce(removeCookie, this.jarOf(collectionId));
    this.updateJar(collectionId, remaining);
    await this.persist(collectionId);
  }

  async clear(collectionId: string): Promise<void> {
    this.jars.set(collectionId, []);
    await this.persist(collectionId);
  }

  async discard(collectionId: string): Promise<void> {
    this.jars.delete(collectionId);
    await rm(this.fileOf(collectionId), { force: true });
  }

  private jarOf(collectionId: string): CookieJar {
    return this.jars.get(collectionId) ?? [];
  }

  private updateJar(collectionId: string, jar: CookieJar): void {
    this.jars.set(collectionId, jar);
    void this.persist(collectionId).catch(() => undefined);
  }

  private fileOf(collectionId: string): string {
    return join(this.directory, `${collectionId.replace(/[^\w-]/g, '_')}.json`);
  }

  private async readJar(collectionId: string): Promise<CookieJar> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.fileOf(collectionId), 'utf8'));
      return Array.isArray(parsed) ? pruneExpired(parsed as CookieJar, Date.now()) : [];
    } catch {
      return [];
    }
  }

  private async persist(collectionId: string): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.fileOf(collectionId), JSON.stringify(this.jarOf(collectionId), null, 2), 'utf8');
  }
}

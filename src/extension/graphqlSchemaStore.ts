import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { GraphqlSchemaSummary } from '../shared/types';

export interface CachedSchema {
  schema: GraphqlSchemaSummary;
  fetchedAt: number;
}

export class GraphqlSchemaStore {
  private readonly directory: string;

  constructor(storageRoot: string) {
    this.directory = path.join(storageRoot, 'graphql-schemas');
  }

  async load(url: string): Promise<CachedSchema | undefined> {
    try {
      return JSON.parse(await fs.readFile(this.fileFor(url), 'utf8')) as CachedSchema;
    } catch {
      return undefined;
    }
  }

  async save(url: string, schema: GraphqlSchemaSummary): Promise<CachedSchema> {
    const cached: CachedSchema = { schema, fetchedAt: Date.now() };
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(this.fileFor(url), JSON.stringify(cached), 'utf8');
    return cached;
  }

  private fileFor(url: string): string {
    return path.join(this.directory, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`);
  }
}

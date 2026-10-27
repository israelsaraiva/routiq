import { describe, expect, it, vi } from 'vitest';
import { SchemaCache } from './schemaCache';

describe('SchemaCache', () => {
  it('loads each schema id once, even for concurrent requests', async () => {
    const cache = new SchemaCache<string>();
    const load = vi.fn(async (id: number) => `schema-${id}`);
    const results = await Promise.all([cache.get(1, load), cache.get(1, load), cache.get(2, load)]);
    expect(results).toEqual(['schema-1', 'schema-1', 'schema-2']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    const cache = new SchemaCache<string>();
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');
    await expect(cache.get(1, load)).rejects.toThrow('down');
    await Promise.resolve();
    expect(await cache.get(1, load)).toBe('ok');
  });

  it('clears entries', async () => {
    const cache = new SchemaCache<string>();
    await cache.get(1, async () => 'a');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

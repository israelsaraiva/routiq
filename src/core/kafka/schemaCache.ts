export class SchemaCache<Value> {
  private readonly entries = new Map<number, Promise<Value>>();

  get(schemaId: number, load: (schemaId: number) => Promise<Value>): Promise<Value> {
    const cached = this.entries.get(schemaId);
    if (cached) {
      return cached;
    }
    const pending = load(schemaId);
    this.entries.set(schemaId, pending);
    pending.catch(() => this.entries.delete(schemaId));
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

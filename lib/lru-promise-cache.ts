export class LruPromiseCache<Key, Value> {
  private readonly entries = new Map<Key, Promise<Value>>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("LRU cache capacity must be a positive integer.");
    }
  }

  get size() {
    return this.entries.size;
  }

  getOrCreate(key: Key, create: () => Promise<Value>) {
    const existingValue = this.entries.get(key);

    if (existingValue) {
      this.entries.delete(key);
      this.entries.set(key, existingValue);
      return existingValue;
    }

    const value = create();
    this.entries.set(key, value);
    void value.catch(() => {
      if (this.entries.get(key) === value) {
        this.entries.delete(key);
      }
    });

    if (this.entries.size > this.capacity) {
      const leastRecentlyUsedEntry = this.entries.keys().next();

      if (!leastRecentlyUsedEntry.done) {
        this.entries.delete(leastRecentlyUsedEntry.value);
      }
    }

    return value;
  }
}

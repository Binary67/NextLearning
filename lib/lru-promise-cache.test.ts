import { describe, expect, it } from "vitest";

import { LruPromiseCache } from "./lru-promise-cache";

describe("LruPromiseCache", () => {
  it("inserts and reuses an entry", async () => {
    const cache = new LruPromiseCache<string, string>(2);
    let createCount = 0;
    const create = () => {
      createCount += 1;
      return Promise.resolve("first");
    };

    await expect(cache.getOrCreate("a", create)).resolves.toBe("first");
    await expect(cache.getOrCreate("a", create)).resolves.toBe("first");

    expect(createCount).toBe(1);
    expect(cache.size).toBe(1);
  });

  it("evicts entries in least-recently-used order", async () => {
    const cache = new LruPromiseCache<string, string>(2);

    await cache.getOrCreate("a", () => Promise.resolve("a"));
    await cache.getOrCreate("b", () => Promise.resolve("b"));
    await cache.getOrCreate("c", () => Promise.resolve("c"));

    let recreatedA = false;
    await cache.getOrCreate("a", () => {
      recreatedA = true;
      return Promise.resolve("new a");
    });

    expect(recreatedA).toBe(true);
  });

  it("refreshes a reused entry before evicting the least recently used", async () => {
    const cache = new LruPromiseCache<string, string>(2);

    await cache.getOrCreate("a", () => Promise.resolve("a"));
    await cache.getOrCreate("b", () => Promise.resolve("b"));
    await cache.getOrCreate("a", () => Promise.resolve("new a"));
    await cache.getOrCreate("c", () => Promise.resolve("c"));

    let recreatedA = false;
    let recreatedB = false;
    await cache.getOrCreate("a", () => {
      recreatedA = true;
      return Promise.resolve("new a");
    });
    await cache.getOrCreate("b", () => {
      recreatedB = true;
      return Promise.resolve("new b");
    });

    expect(recreatedA).toBe(false);
    expect(recreatedB).toBe(true);
  });

  it("never retains more entries than its fixed capacity", async () => {
    const cache = new LruPromiseCache<number, number>(2);

    await cache.getOrCreate(1, () => Promise.resolve(1));
    await cache.getOrCreate(2, () => Promise.resolve(2));
    await cache.getOrCreate(3, () => Promise.resolve(3));

    expect(cache.size).toBe(2);
  });

  it("removes failed entries so a later call can retry", async () => {
    const cache = new LruPromiseCache<string, string>(2);

    await expect(
      cache.getOrCreate("a", () => Promise.reject(new Error("failed"))),
    ).rejects.toThrow("failed");

    expect(cache.size).toBe(0);
    await expect(
      cache.getOrCreate("a", () => Promise.resolve("retried")),
    ).resolves.toBe("retried");
  });
});

import type { PDFDocumentProxy } from "pdfjs-dist";

import { describe, expect, it, vi } from "vitest";

import { PdfDocumentCache } from "@/lib/pdf-page-renderer";

describe("PdfDocumentCache", () => {
  it("shares one document while leases are active", async () => {
    const cache = new PdfDocumentCache(2);
    const resource = createPdfResource();
    const create = vi.fn(() => Promise.resolve(resource));

    const [first, second] = await Promise.all([
      cache.acquire("document", create),
      cache.acquire("document", create),
    ]);

    expect(create).toHaveBeenCalledOnce();
    first.release();
    second.release();
    expect(resource.destroy).not.toHaveBeenCalled();
  });

  it("destroys an idle document after eviction", async () => {
    const cache = new PdfDocumentCache(1);
    const firstResource = createPdfResource();
    const first = await cache.acquire("first", () =>
      Promise.resolve(firstResource),
    );
    first.release();

    const second = await cache.acquire("second", () =>
      Promise.resolve(createPdfResource()),
    );

    await vi.waitFor(() =>
      expect(firstResource.destroy).toHaveBeenCalledOnce(),
    );
    second.release();
  });

  it("waits for the final active lease before destroying an evicted document", async () => {
    const cache = new PdfDocumentCache(1);
    const firstResource = createPdfResource();
    const first = await cache.acquire("first", () =>
      Promise.resolve(firstResource),
    );
    const second = await cache.acquire("second", () =>
      Promise.resolve(createPdfResource()),
    );

    expect(firstResource.destroy).not.toHaveBeenCalled();
    first.release();
    first.release();

    await vi.waitFor(() =>
      expect(firstResource.destroy).toHaveBeenCalledOnce(),
    );
    second.release();
  });

  it("removes failed loads so the document can be retried", async () => {
    const cache = new PdfDocumentCache(1);

    await expect(
      cache.acquire("document", () => Promise.reject(new Error("failed"))),
    ).rejects.toThrow("failed");

    const resource = createPdfResource();
    const lease = await cache.acquire("document", () =>
      Promise.resolve(resource),
    );

    expect(lease.document).toBe(resource.document);
    lease.release();
  });
});

function createPdfResource() {
  return {
    document: {} as PDFDocumentProxy,
    destroy: vi.fn(() => Promise.resolve()),
  };
}

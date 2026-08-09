import type { PDFDocumentProxy } from "pdfjs-dist";

import { LruPromiseCache } from "@/lib/lru-promise-cache";

const pdfPageImagePromises = new LruPromiseCache<
  string,
  RenderedPdfPageImage
>(6);

const TARGET_PAGE_WIDTHS = [2000, 1700, 1400, 1150, 950, 768];
const JPEG_QUALITIES = [0.86, 0.72, 0.58, 0.44, 0.32];
const STANDARD_FONT_DATA_URL = "/api/pdf/standard-fonts/";

export type RenderedPdfPageImage = {
  imageUrl: string;
  width: number;
  height: number;
};

type PdfDocumentResource = {
  document: PDFDocumentProxy;
  destroy: () => Promise<void>;
};

type PdfDocumentCacheEntry = {
  promise: Promise<PdfDocumentResource>;
  references: number;
  evicted: boolean;
  disposalScheduled: boolean;
};

export type PdfDocumentLease = {
  document: PDFDocumentProxy;
  release: () => void;
};

export class PdfDocumentCache {
  private readonly entries = new Map<string, PdfDocumentCacheEntry>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("PDF cache capacity must be a positive integer.");
    }
  }

  async acquire(
    key: string,
    create: () => Promise<PdfDocumentResource>,
  ): Promise<PdfDocumentLease> {
    let entry = this.entries.get(key);

    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    } else {
      entry = {
        promise: create(),
        references: 0,
        evicted: false,
        disposalScheduled: false,
      };
      this.entries.set(key, entry);
      this.evictLeastRecentlyUsedEntry();
    }

    entry.references += 1;

    let resource: PdfDocumentResource;

    try {
      resource = await entry.promise;
    } catch (error) {
      this.releaseEntry(key, entry);
      throw error;
    }

    let released = false;

    return {
      document: resource.document,
      release: () => {
        if (released) {
          return;
        }

        released = true;
        this.releaseEntry(key, entry);
      },
    };
  }

  private evictLeastRecentlyUsedEntry() {
    if (this.entries.size <= this.capacity) {
      return;
    }

    const leastRecentlyUsedEntry = this.entries.entries().next();

    if (leastRecentlyUsedEntry.done) {
      return;
    }

    const [key, entry] = leastRecentlyUsedEntry.value;
    this.entries.delete(key);
    entry.evicted = true;
    this.disposeEntryWhenIdle(entry);
  }

  private releaseEntry(key: string, entry: PdfDocumentCacheEntry) {
    entry.references -= 1;

    void entry.promise.catch(() => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });
    this.disposeEntryWhenIdle(entry);
  }

  private disposeEntryWhenIdle(entry: PdfDocumentCacheEntry) {
    if (
      !entry.evicted ||
      entry.references !== 0 ||
      entry.disposalScheduled
    ) {
      return;
    }

    entry.disposalScheduled = true;
    void entry.promise
      .then((resource) => resource.destroy())
      .catch(() => {});
  }
}

const pdfDocumentCache = new PdfDocumentCache(2);

export function acquirePdfDocument(
  documentId: string,
  documentUrl: string,
) {
  return pdfDocumentCache.acquire(documentId, () =>
    import("pdfjs-dist/webpack.mjs").then(async ({ getDocument }) => {
      const loadingTask = getDocument({
        url: documentUrl,
        standardFontDataUrl: STANDARD_FONT_DATA_URL,
      });

      try {
        const document = await loadingTask.promise;
        return {
          document,
          destroy: () => loadingTask.destroy(),
        };
      } catch (error) {
        await loadingTask.destroy();
        throw error;
      }
    }),
  );
}

export async function renderPdfPageImage(
  documentId: string,
  documentUrl: string,
  pageIndex: number,
  maximumDataUrlBytes: number,
) {
  const cacheKey = [
    documentId,
    pageIndex,
    Math.floor(maximumDataUrlBytes),
  ].join(":");
  const imagePromise = pdfPageImagePromises.getOrCreate(cacheKey, () =>
    renderPage(
      documentId,
      documentUrl,
      pageIndex,
      maximumDataUrlBytes,
    ),
  );

  try {
    return await imagePromise;
  } catch (reason) {
    if (
      reason instanceof Error &&
      (reason.message === "That PDF page is not available." ||
        reason.message.startsWith("The Realtime connection") ||
        reason.message.startsWith("This PDF page cannot"))
    ) {
      throw reason;
    }

    throw new Error(`PDF page ${pageIndex} could not be read or rendered.`);
  }
}

async function renderPage(
  documentId: string,
  documentUrl: string,
  pageIndex: number,
  maximumDataUrlBytes: number,
) {
  if (!Number.isInteger(pageIndex) || pageIndex < 1) {
    throw new Error("That PDF page is not available.");
  }

  if (!Number.isFinite(maximumDataUrlBytes) || maximumDataUrlBytes <= 0) {
    throw new Error(
      "The Realtime connection has no room for a usable page image.",
    );
  }

  const lease = await acquirePdfDocument(documentId, documentUrl);

  try {
    if (pageIndex > lease.document.numPages) {
      throw new Error("That PDF page is not available.");
    }

    const page = await lease.document.getPage(pageIndex);
    const baseViewport = page.getViewport({ scale: 1 });

    for (const targetWidth of TARGET_PAGE_WIDTHS) {
      const viewport = page.getViewport({
        scale: targetWidth / baseViewport.width,
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({
        canvas,
        viewport,
        background: "rgb(255,255,255)",
      }).promise;

      for (const quality of JPEG_QUALITIES) {
        const imageUrl = canvas.toDataURL("image/jpeg", quality);

        if (
          imageUrl.startsWith("data:image/jpeg;base64,") &&
          imageUrl.length < maximumDataUrlBytes
        ) {
          return {
            imageUrl,
            width: canvas.width,
            height: canvas.height,
          };
        }
      }
    }

    throw new Error(
      "This PDF page cannot be made readable within the Realtime connection's image limit.",
    );
  } finally {
    lease.release();
  }
}

import type { PDFDocumentProxy } from "pdfjs-dist";

import { LruPromiseCache } from "@/lib/lru-promise-cache";

const pdfDocumentPromises = new LruPromiseCache<string, PDFDocumentProxy>(2);
const pdfPageImagePromises = new LruPromiseCache<
  string,
  RenderedPdfPageImage
>(6);

const TARGET_PAGE_WIDTHS = [2000, 1700, 1400, 1150, 950, 768];
const JPEG_QUALITIES = [0.86, 0.72, 0.58, 0.44, 0.32];

export type RenderedPdfPageImage = {
  imageUrl: string;
  width: number;
  height: number;
};

export async function loadPdfDocument(
  documentId: string,
  documentUrl: string,
) {
  return pdfDocumentPromises.getOrCreate(documentId, () =>
    import("pdfjs-dist/webpack.mjs").then(
      ({ getDocument }) => getDocument({ url: documentUrl }).promise,
    ),
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

  const pdfDocument = await loadPdfDocument(documentId, documentUrl);

  if (pageIndex > pdfDocument.numPages) {
    throw new Error("That PDF page is not available.");
  }

  const page = await pdfDocument.getPage(pageIndex);
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
}

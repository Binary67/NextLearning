import type { PDFDocumentProxy } from "pdfjs-dist";

const pdfDocumentPromises = new Map<string, Promise<PDFDocumentProxy>>();
const pdfPageImagePromises = new Map<
  string,
  Promise<RenderedPdfPageImage>
>();

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
  const existingDocument = pdfDocumentPromises.get(documentId);

  if (existingDocument) {
    return existingDocument;
  }

  const documentPromise = import("pdfjs-dist/webpack.mjs").then(
    ({ getDocument }) => getDocument({ url: documentUrl }).promise,
  );
  pdfDocumentPromises.set(documentId, documentPromise);

  try {
    return await documentPromise;
  } catch (reason) {
    pdfDocumentPromises.delete(documentId);
    throw reason;
  }
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
  const existingImage = pdfPageImagePromises.get(cacheKey);

  if (existingImage) {
    return existingImage;
  }

  const imagePromise = renderPage(
    documentId,
    documentUrl,
    pageIndex,
    maximumDataUrlBytes,
  );
  pdfPageImagePromises.set(cacheKey, imagePromise);

  try {
    return await imagePromise;
  } catch (reason) {
    pdfPageImagePromises.delete(cacheKey);

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

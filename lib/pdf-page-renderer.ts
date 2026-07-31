import type { PDFDocumentProxy } from "pdfjs-dist";

const pdfDocumentPromises = new Map<string, Promise<PDFDocumentProxy>>();

export async function renderPdfPageAsImage(
  documentId: string,
  documentUrl: string,
  pageIndex: number,
) {
  const pdfDocument = await loadPdfDocument(documentId, documentUrl);
  const page = await pdfDocument.getPage(pageIndex);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    1.4,
    900 / Math.max(initialViewport.width, initialViewport.height),
  );
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({
    canvas,
    viewport,
    background: "rgb(255,255,255)",
  }).promise;

  return canvas.toDataURL("image/jpeg", 0.72);
}

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

  return documentPromise;
}

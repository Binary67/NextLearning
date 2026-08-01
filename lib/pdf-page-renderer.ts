import type { PDFDocumentProxy } from "pdfjs-dist";

const pdfDocumentPromises = new Map<string, Promise<PDFDocumentProxy>>();

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

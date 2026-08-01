import type { PDFDocumentProxy } from "pdfjs-dist";

import {
  VISUAL_GUIDE_BAND_COUNT,
  VISUAL_GUIDE_BANDS,
} from "@/lib/visual-guide";

const pdfDocumentPromises = new Map<string, Promise<PDFDocumentProxy>>();

export async function renderPdfPageForTutor(
  documentId: string,
  documentUrl: string,
  pageIndex: number,
  maxImageBytes: number,
) {
  const pdfDocument = await loadPdfDocument(documentId, documentUrl);
  const page = await pdfDocument.getPage(pageIndex);
  const initialViewport = page.getViewport({ scale: 1 });
  let longestEdge = 600;
  let quality = 0.55;

  while (true) {
    const scale = Math.min(
      1,
      longestEdge /
        Math.max(initialViewport.width, initialViewport.height),
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
    drawVisualGuideBands(canvas);

    const imageUrl = canvas.toDataURL("image/jpeg", quality);
    const imageBytes = new TextEncoder().encode(imageUrl).byteLength;

    if (imageBytes <= maxImageBytes) {
      return imageUrl;
    }

    if (longestEdge > 320) {
      const sizeRatio = Math.sqrt(maxImageBytes / imageBytes) * 0.9;
      longestEdge = Math.max(
        320,
        Math.floor(longestEdge * Math.min(0.9, sizeRatio)),
      );
      continue;
    }

    if (quality > 0.3) {
      quality = Math.max(0.3, quality - 0.1);
      continue;
    }

    throw new Error(
      "The source page image is too large for the Realtime connection.",
    );
  }
}

function drawVisualGuideBands(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("The source page image could not be prepared.");
  }

  const bandHeight = canvas.height / VISUAL_GUIDE_BAND_COUNT;
  const labelSize = Math.max(14, Math.round(canvas.width / 55));

  context.save();
  context.strokeStyle = "rgba(0, 93, 190, 0.72)";
  context.lineWidth = 2;

  for (let offset = 1; offset < VISUAL_GUIDE_BAND_COUNT; offset += 1) {
    context.beginPath();
    context.moveTo(0, offset * bandHeight);
    context.lineTo(canvas.width, offset * bandHeight);
    context.stroke();
  }

  context.font = `700 ${labelSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const [index, band] of VISUAL_GUIDE_BANDS.entries()) {
    const centerX = labelSize;
    const centerY = index * bandHeight + labelSize;
    const badgeSize = labelSize * 1.65;

    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.fillRect(
      centerX - badgeSize / 2,
      centerY - badgeSize / 2,
      badgeSize,
      badgeSize,
    );
    context.fillStyle = "rgb(0, 83, 170)";
    context.fillText(band, centerX, centerY);
  }

  context.restore();
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

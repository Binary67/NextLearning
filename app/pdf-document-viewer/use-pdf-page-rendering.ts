import { useEffect, useRef, useState } from "react";

import type { SelectionBounds } from "@/lib/document-selection";
import { acquirePdfDocument } from "@/lib/pdf-page-renderer";
import type { PdfDocumentLease } from "@/lib/pdf-page-renderer";
import {
  createPdfTextRegion,
  type PdfTextRegion,
} from "@/lib/pdf-text-regions";

import {
  createHighlightBoundsSignature,
  findFirstVisualHighlight,
} from "./highlight-bounds";
import type { PageSize } from "./types";

type PdfRenderTask = {
  cancel: () => void;
  promise: Promise<void>;
};

export function usePdfPageRendering({
  documentId,
  documentUrl,
  pageIndex,
  tutorHighlightBounds,
}: {
  documentId: string;
  documentUrl: string;
  pageIndex: number;
  tutorHighlightBounds: readonly SelectionBounds[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const renderedPageKeyRef = useRef<string | null>(null);
  const handledHighlightSignatureRef = useRef<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [renderedPageKey, setRenderedPageKey] = useState<string | null>(
    null,
  );
  const [textRegions, setTextRegions] = useState<PdfTextRegion[]>([]);
  const [error, setError] = useState("");
  const pageKey = JSON.stringify([documentId, documentUrl, pageIndex]);
  const highlightSignature = createHighlightBoundsSignature(
    pageIndex,
    tutorHighlightBounds,
  );
  const firstHighlight = findFirstVisualHighlight(tutorHighlightBounds);
  const firstHighlightTop = firstHighlight?.y;
  const firstHighlightHeight = firstHighlight?.height;
  const isCurrentPageRendered = renderedPageKey === pageKey;
  const visiblePageSize = isCurrentPageRendered ? pageSize : null;

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });

    resizeObserver.observe(container);
    setContainerWidth(container.clientWidth);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || containerWidth === 0) {
      return;
    }

    const canvasElement = canvas;
    let active = true;
    let renderTask: PdfRenderTask | null = null;
    let documentLease: PdfDocumentLease | null = null;

    async function renderPage() {
      setError("");

      if (renderedPageKeyRef.current !== pageKey) {
        renderedPageKeyRef.current = null;
        canvasElement.width = 0;
        canvasElement.height = 0;
        canvasElement.style.width = "";
        canvasElement.style.height = "";
        setRenderedPageKey(null);
        setPageSize(null);
        setTextRegions([]);
      }

      try {
        const pendingRenderTask = renderTaskRef.current;

        if (pendingRenderTask) {
          pendingRenderTask.cancel();
          await pendingRenderTask.promise.catch(() => {});

          if (renderTaskRef.current === pendingRenderTask) {
            renderTaskRef.current = null;
          }
        }

        if (!active) {
          return;
        }

        documentLease = await acquirePdfDocument(documentId, documentUrl);
        const page = await documentLease.document.getPage(pageIndex);

        if (!active) {
          return;
        }

        const initialViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(containerWidth - 32, 1);
        const scale = availableWidth / initialViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const stagingCanvas = document.createElement("canvas");

        stagingCanvas.width = Math.floor(viewport.width * outputScale);
        stagingCanvas.height = Math.floor(viewport.height * outputScale);

        const pageRenderTask = page.render({
          canvas: stagingCanvas,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
          background: "rgb(255,255,255)",
        });
        renderTask = pageRenderTask;
        renderTaskRef.current = pageRenderTask;

        const [textItems] = await Promise.all([
          (async () => {
            const reader = page.streamTextContent().getReader();
            const items: Awaited<
              ReturnType<typeof page.getTextContent>
            >["items"] = [];

            try {
              while (true) {
                const { value, done } = await reader.read();

                if (done) {
                  return items;
                }

                items.push(...value.items);
              }
            } finally {
              reader.releaseLock();
            }
          })(),
          pageRenderTask.promise,
        ]);

        if (renderTaskRef.current === pageRenderTask) {
          renderTaskRef.current = null;
        }

        if (!active) {
          return;
        }

        const pageTextRegions = textItems.flatMap((item) => {
          if (!("str" in item)) {
            return [];
          }

          const region = createPdfTextRegion({
            text: item.str,
            itemTransform: item.transform,
            itemWidth: item.width,
            viewportTransform: viewport.transform,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            viewportScale: viewport.scale,
          });

          return region ? [region] : [];
        });
        const context = canvasElement.getContext("2d");

        if (!context) {
          throw new Error("The PDF page could not be rendered.");
        }

        canvasElement.width = stagingCanvas.width;
        canvasElement.height = stagingCanvas.height;
        canvasElement.style.width = `${Math.floor(viewport.width)}px`;
        canvasElement.style.height = `${Math.floor(viewport.height)}px`;
        context.drawImage(stagingCanvas, 0, 0);
        renderedPageKeyRef.current = pageKey;
        setTextRegions(pageTextRegions);
        setPageSize({
          width: viewport.width,
          height: viewport.height,
        });
        setRenderedPageKey(pageKey);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "The PDF page could not be rendered.",
          );
        }
      } finally {
        documentLease?.release();
      }
    }

    void renderPage();

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [containerWidth, documentId, documentUrl, pageIndex, pageKey]);

  useEffect(() => {
    const container = containerRef.current;
    const surface = surfaceRef.current;

    if (handledHighlightSignatureRef.current === highlightSignature) {
      return;
    }

    if (
      firstHighlightTop === undefined ||
      firstHighlightHeight === undefined
    ) {
      handledHighlightSignatureRef.current = highlightSignature;
      return;
    }

    if (!isCurrentPageRendered || !container || !surface) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const highlightCenter =
      surfaceRect.top -
      containerRect.top +
      container.scrollTop +
      (firstHighlightTop + firstHighlightHeight / 2) * surfaceRect.height;

    container.scrollTop = Math.max(
      0,
      highlightCenter - container.clientHeight / 2,
    );
    handledHighlightSignatureRef.current = highlightSignature;
  }, [
    firstHighlightHeight,
    firstHighlightTop,
    highlightSignature,
    isCurrentPageRendered,
  ]);

  return {
    canvasRef,
    containerRef,
    error,
    isCurrentPageRendered,
    pageKey,
    surfaceRef,
    textRegions,
    visiblePageSize,
  };
}

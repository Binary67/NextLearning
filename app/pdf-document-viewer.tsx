"use client";

import { useEffect, useRef, useState } from "react";

import { loadPdfDocument } from "@/lib/pdf-page-renderer";
import {
  getVisualGuideBounds,
  type VisualGuideRegion,
} from "@/lib/visual-guide";

type PdfDocumentViewerProps = {
  documentId: string;
  documentUrl: string;
  documentName: string;
  pageIndex: number;
  visualGuide: VisualGuideRegion | null;
};

type PageSize = {
  width: number;
  height: number;
};

type PdfRenderTask = {
  cancel: () => void;
  promise: Promise<void>;
};

export function PdfDocumentViewer({
  documentId,
  documentUrl,
  documentName,
  pageIndex,
  visualGuide,
}: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualGuideRef = useRef<HTMLSpanElement>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [error, setError] = useState("");
  const visualGuideBounds = visualGuide
    ? getVisualGuideBounds(visualGuide)
    : null;

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

    async function renderPage() {
      setError("");
      setPageSize(null);

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

        const pdfDocument = await loadPdfDocument(documentId, documentUrl);

        if (!active) {
          return;
        }

        const page = await pdfDocument.getPage(pageIndex);

        if (!active) {
          return;
        }

        const initialViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(containerWidth - 32, 1);
        const scale = availableWidth / initialViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;

        canvasElement.width = Math.floor(viewport.width * outputScale);
        canvasElement.height = Math.floor(viewport.height * outputScale);
        canvasElement.style.width = `${Math.floor(viewport.width)}px`;
        canvasElement.style.height = `${Math.floor(viewport.height)}px`;

        const pageRenderTask = page.render({
          canvas: canvasElement,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
          background: "rgb(255,255,255)",
        });
        renderTask = pageRenderTask;
        renderTaskRef.current = pageRenderTask;

        try {
          await pageRenderTask.promise;
        } finally {
          if (renderTaskRef.current === pageRenderTask) {
            renderTaskRef.current = null;
          }
        }

        if (active) {
          setPageSize({
            width: viewport.width,
            height: viewport.height,
          });
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "The PDF page could not be rendered.",
          );
        }
      }
    }

    void renderPage();

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [containerWidth, documentId, documentUrl, pageIndex]);

  useEffect(() => {
    if (!pageSize || !visualGuide) {
      return;
    }

    visualGuideRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }, [pageSize, visualGuide]);

  return (
    <div
      ref={containerRef}
      className="pdf-viewer"
      aria-label={`${documentName}, page ${pageIndex}`}
    >
      {error ? (
        <p className="pdf-viewer-error" role="alert">
          {error}
        </p>
      ) : (
        <div
          className="pdf-page-surface"
          style={
            pageSize
              ? {
                  width: pageSize.width,
                  height: pageSize.height,
                }
              : undefined
          }
        >
          <canvas ref={canvasRef} />
          {pageSize && visualGuideBounds && (
            <span
              ref={visualGuideRef}
              className="pdf-visual-guide"
              style={{
                left: `${visualGuideBounds.x * 100}%`,
                top: `${visualGuideBounds.y * 100}%`,
                width: `${visualGuideBounds.width * 100}%`,
                height: `${visualGuideBounds.height * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </div>
  );
}

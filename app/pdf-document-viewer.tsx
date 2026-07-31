"use client";

import { useEffect, useRef, useState } from "react";

import type { DocumentLayoutBlock } from "@/lib/document-layout";
import { loadPdfDocument } from "@/lib/pdf-page-renderer";

type PdfDocumentViewerProps = {
  documentId: string;
  documentUrl: string;
  documentName: string;
  pageIndex: number;
  highlightedBlocks: DocumentLayoutBlock[];
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
  highlightedBlocks,
}: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstHighlightRef = useRef<HTMLSpanElement>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [error, setError] = useState("");

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
    if (!pageSize || highlightedBlocks.length === 0) {
      return;
    }

    firstHighlightRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }, [highlightedBlocks, pageSize]);

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
          {pageSize &&
            highlightedBlocks.map((block, index) => (
              <span
                ref={index === 0 ? firstHighlightRef : undefined}
                className="pdf-block-highlight"
                key={block.id}
                style={{
                  left: `${block.bounds.x * 100}%`,
                  top: `${block.bounds.y * 100}%`,
                  width: `${block.bounds.width * 100}%`,
                  height: `${block.bounds.height * 100}%`,
                }}
                aria-hidden="true"
              />
            ))}
        </div>
      )}
    </div>
  );
}

"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  DocumentSelection,
  SelectionBounds,
} from "@/lib/document-selection";
import { acquirePdfDocument } from "@/lib/pdf-page-renderer";
import type { PdfDocumentLease } from "@/lib/pdf-page-renderer";
import {
  createPdfTextRegion,
  type PdfTextRegion,
} from "@/lib/pdf-text-regions";

import {
  createHighlightBoundsSignature,
  findFirstVisualHighlight,
} from "./pdf-document-viewer-helpers";

type PdfDocumentViewerProps = {
  documentId: string;
  documentUrl: string;
  documentName: string;
  pageIndex: number;
  selection: DocumentSelection | null;
  tutorHighlightBounds: SelectionBounds[];
  onSelectionChange: (selection: DocumentSelection | null) => void;
};

type PageSize = {
  width: number;
  height: number;
};

type PagePoint = {
  x: number;
  y: number;
};

type PdfRenderTask = {
  cancel: () => void;
  promise: Promise<void>;
};

const MINIMUM_SELECTION_SIZE = 0.01;
const MAXIMUM_SELECTION_IMAGE_BYTES = 48 * 1024;

export function PdfDocumentViewer({
  documentId,
  documentUrl,
  documentName,
  pageIndex,
  selection,
  tutorHighlightBounds,
  onSelectionChange,
}: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const renderedPageKeyRef = useRef<string | null>(null);
  const handledHighlightSignatureRef = useRef<string | null>(null);
  const dragStartRef = useRef<PagePoint | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [renderedPageKey, setRenderedPageKey] = useState<string | null>(null);
  const [textRegions, setTextRegions] = useState<PdfTextRegion[]>([]);
  const [draftBounds, setDraftBounds] = useState<SelectionBounds | null>(
    null,
  );
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
        setDraftBounds(null);
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

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !visiblePageSize) {
      return;
    }

    const point = getPagePoint(event);

    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = point;
    setDraftBounds({ ...point, width: 0, height: 0 });
    onSelectionChange(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;

    if (!dragStart) {
      return;
    }

    const point = getPagePoint(event);

    if (point) {
      setDraftBounds(getBounds(dragStart, point));
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;
    dragStartRef.current = null;

    if (!dragStart) {
      return;
    }

    const point = getPagePoint(event);
    const bounds = point ? getBounds(dragStart, point) : null;
    setDraftBounds(null);

    if (
      !bounds ||
      bounds.width < MINIMUM_SELECTION_SIZE ||
      bounds.height < MINIMUM_SELECTION_SIZE
    ) {
      onSelectionChange(null);
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    onSelectionChange({
      page_index: pageIndex,
      bounds,
      text: extractSelectedText(textRegions, bounds),
      image_url: createSelectionImage(canvas, bounds),
    });
  }

  function getPagePoint(
    event: ReactPointerEvent<HTMLDivElement>,
  ): PagePoint | null {
    const surface = surfaceRef.current;

    if (!surface) {
      return null;
    }

    const rect = surface.getBoundingClientRect();

    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }

  const visibleBounds =
    draftBounds ??
    (selection?.page_index === pageIndex ? selection.bounds : null);

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
          ref={surfaceRef}
          className="pdf-page-surface selectable"
          style={
            visiblePageSize
              ? {
                  width: visiblePageSize.width,
                  height: visiblePageSize.height,
                }
              : undefined
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStartRef.current = null;
            setDraftBounds(null);
          }}
        >
          <canvas ref={canvasRef} hidden={!isCurrentPageRendered} />
          {visiblePageSize &&
            tutorHighlightBounds.map((bounds, index) => (
              <span
                className="pdf-tutor-highlight"
                style={{
                  left: `${bounds.x * 100}%`,
                  top: `${bounds.y * 100}%`,
                  width: `${bounds.width * 100}%`,
                  height: `${bounds.height * 100}%`,
                }}
                aria-hidden="true"
                key={`${bounds.x}:${bounds.y}:${index}`}
              />
            ))}
          {visiblePageSize && visibleBounds && (
            <span
              className={`pdf-user-selection${
                draftBounds ? " drawing" : ""
              }`}
              style={{
                left: `${visibleBounds.x * 100}%`,
                top: `${visibleBounds.y * 100}%`,
                width: `${visibleBounds.width * 100}%`,
                height: `${visibleBounds.height * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </div>
  );
}

function getBounds(start: PagePoint, end: PagePoint): SelectionBounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function extractSelectedText(
  textRegions: PdfTextRegion[],
  selection: SelectionBounds,
) {
  return textRegions
    .filter((region) => intersects(region, selection))
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((region) => region.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function intersects(left: SelectionBounds, right: SelectionBounds) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function createSelectionImage(
  source: HTMLCanvasElement,
  selection: SelectionBounds,
) {
  const padding = 0.025;
  const x = Math.max(0, selection.x - padding);
  const y = Math.max(0, selection.y - padding);
  const right = Math.min(1, selection.x + selection.width + padding);
  const bottom = Math.min(1, selection.y + selection.height + padding);
  const sourceX = Math.floor(x * source.width);
  const sourceY = Math.floor(y * source.height);
  const sourceWidth = Math.max(1, Math.ceil((right - x) * source.width));
  const sourceHeight = Math.max(1, Math.ceil((bottom - y) * source.height));
  let longestEdge = Math.min(1200, Math.max(sourceWidth, sourceHeight));
  let quality = 0.82;

  while (true) {
    const scale = Math.min(
      1,
      longestEdge / Math.max(sourceWidth, sourceHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("The selected document region could not be prepared.");
    }

    context.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const imageUrl = canvas.toDataURL("image/jpeg", quality);

    if (imageUrl.length <= MAXIMUM_SELECTION_IMAGE_BYTES) {
      return imageUrl;
    }

    if (longestEdge > 420) {
      longestEdge = Math.max(420, Math.floor(longestEdge * 0.8));
    } else if (quality > 0.42) {
      quality = Math.max(0.42, quality - 0.1);
    } else {
      throw new Error("The selected document region is too large.");
    }
  }
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

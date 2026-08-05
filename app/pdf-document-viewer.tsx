"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  DocumentSelection,
  SelectionBounds,
} from "@/lib/document-selection";
import { loadPdfDocument } from "@/lib/pdf-page-renderer";

type PdfDocumentViewerProps = {
  documentId: string;
  documentUrl: string;
  documentName: string;
  pageIndex: number;
  selection: DocumentSelection | null;
  tutorSourceText: string | null;
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

type TextRegion = SelectionBounds & {
  text: string;
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
  tutorSourceText,
  onSelectionChange,
}: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const dragStartRef = useRef<PagePoint | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [textRegions, setTextRegions] = useState<TextRegion[]>([]);
  const [draftBounds, setDraftBounds] = useState<SelectionBounds | null>(
    null,
  );
  const [error, setError] = useState("");
  const tutorHighlightBounds = useMemo(
    () => findTutorHighlightBounds(textRegions, tutorSourceText),
    [textRegions, tutorSourceText],
  );

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
      setTextRegions([]);
      setDraftBounds(null);

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

        const [textItems, pdfModule] = await Promise.all([
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
          import("pdfjs-dist/webpack.mjs"),
          pageRenderTask.promise,
        ]);

        if (renderTaskRef.current === pageRenderTask) {
          renderTaskRef.current = null;
        }

        if (!active) {
          return;
        }

        const pageTextRegions = textItems.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) {
            return [];
          }

          const transform = pdfModule.Util.transform(
            viewport.transform,
            item.transform,
          );
          const height = Math.hypot(transform[2], transform[3]);

          return [
            {
              x: transform[4] / viewport.width,
              y: (transform[5] - height) / viewport.height,
              width: (item.width * viewport.scale) / viewport.width,
              height: height / viewport.height,
              text: item.str,
            },
          ];
        });
        setTextRegions(pageTextRegions);
        setPageSize({
          width: viewport.width,
          height: viewport.height,
        });
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
    const firstHighlight = tutorHighlightBounds[0];
    const container = containerRef.current;
    const surface = surfaceRef.current;

    if (!firstHighlight || !container || !surface) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const highlightCenter =
      surfaceRect.top -
      containerRect.top +
      container.scrollTop +
      (firstHighlight.y + firstHighlight.height / 2) * surfaceRect.height;

    container.scrollTop = Math.max(
      0,
      highlightCenter - container.clientHeight / 2,
    );
  }, [tutorHighlightBounds]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !pageSize) {
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
            pageSize
              ? {
                  width: pageSize.width,
                  height: pageSize.height,
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
          <canvas ref={canvasRef} />
          {pageSize &&
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
          {pageSize && visibleBounds && (
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

function findTutorHighlightBounds(
  textRegions: TextRegion[],
  sourceText: string | null,
) {
  if (!sourceText || textRegions.length === 0) {
    return [];
  }

  const query = normalizeMatchText(sourceText);

  if (!query) {
    return [];
  }

  const searchablePage = createSearchablePageText(textRegions);
  const matchStart = searchablePage.text.indexOf(query);

  // An absent or repeated passage is ambiguous, so leave the PDF unmarked.
  if (
    matchStart === -1 ||
    searchablePage.text.indexOf(query, matchStart + 1) !== -1
  ) {
    return [];
  }

  const matchingRegionIndexes = new Set(
    searchablePage.regionIndexes.slice(
      matchStart,
      matchStart + query.length,
    ),
  );
  const matchingRegions = Array.from(matchingRegionIndexes, (index) => {
    return textRegions[index];
  });

  return mergeTextRegionsByLine(matchingRegions);
}

function createSearchablePageText(textRegions: TextRegion[]) {
  let text = "";
  const regionIndexes: number[] = [];
  let previousRegion: TextRegion | null = null;

  textRegions.forEach((region, regionIndex) => {
    const normalizedText = normalizeMatchText(region.text);

    if (!normalizedText) {
      return;
    }

    if (
      text &&
      previousRegion &&
      shouldSeparateTextRegions(previousRegion, region)
    ) {
      text += " ";
      regionIndexes.push(regionIndex);
    }

    text += normalizedText;

    for (let index = 0; index < normalizedText.length; index += 1) {
      regionIndexes.push(regionIndex);
    }

    previousRegion = region;
  });

  return { text, regionIndexes };
}

function normalizeMatchText(text: string) {
  // Normalize PDF line wrapping and typography without changing the words.
  return text
    .normalize("NFKC")
    .replace(/[-\u00ad\u2010-\u2015\u2212]\s+/g, "")
    .replace(/\u00ad/g, "")
    .replace(/[-\u2010-\u2015\u2212]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function shouldSeparateTextRegions(
  previous: TextRegion,
  current: TextRegion,
) {
  if (/[-\u00ad\u2010-\u2015\u2212]\s*$/.test(previous.text)) {
    return false;
  }

  if (/\s$/.test(previous.text) || /^\s/.test(current.text)) {
    return true;
  }

  const previousCenterY = previous.y + previous.height / 2;
  const currentCenterY = current.y + current.height / 2;
  const lineTolerance = Math.max(previous.height, current.height) / 2;

  if (Math.abs(previousCenterY - currentCenterY) > lineTolerance) {
    return true;
  }

  if (current.x < previous.x) {
    return true;
  }

  const horizontalGap = current.x - (previous.x + previous.width);
  return horizontalGap > Math.max(previous.height, current.height) * 0.15;
}

function mergeTextRegionsByLine(textRegions: TextRegion[]) {
  const lines: SelectionBounds[] = [];

  textRegions.forEach((region) => {
    const currentLine = lines.at(-1);

    if (!currentLine || !regionsShareLine(currentLine, region)) {
      lines.push({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      });
      return;
    }

    const right = Math.max(
      currentLine.x + currentLine.width,
      region.x + region.width,
    );
    const bottom = Math.max(
      currentLine.y + currentLine.height,
      region.y + region.height,
    );
    currentLine.x = Math.min(currentLine.x, region.x);
    currentLine.y = Math.min(currentLine.y, region.y);
    currentLine.width = right - currentLine.x;
    currentLine.height = bottom - currentLine.y;
  });

  return lines.map(addHighlightPadding);
}

function regionsShareLine(
  currentLine: SelectionBounds,
  region: TextRegion,
) {
  const verticalOverlap =
    Math.min(
      currentLine.y + currentLine.height,
      region.y + region.height,
    ) - Math.max(currentLine.y, region.y);
  const minimumHeight = Math.min(currentLine.height, region.height);
  const horizontalGap = region.x - (currentLine.x + currentLine.width);
  const referenceHeight = Math.max(currentLine.height, region.height);
  const minimumGap = -referenceHeight / 2;
  const maximumGap = referenceHeight * 2;

  return (
    verticalOverlap >= minimumHeight * 0.45 &&
    horizontalGap >= minimumGap &&
    horizontalGap <= maximumGap
  );
}

function addHighlightPadding(bounds: SelectionBounds) {
  const horizontalPadding = 0.003;
  const verticalPadding = 0.0015;
  const x = clamp(bounds.x - horizontalPadding);
  const y = clamp(bounds.y - verticalPadding);
  const right = clamp(bounds.x + bounds.width + horizontalPadding);
  const bottom = clamp(bounds.y + bounds.height + verticalPadding);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
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
  textRegions: TextRegion[],
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

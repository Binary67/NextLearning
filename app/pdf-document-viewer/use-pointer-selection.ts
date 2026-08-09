import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type {
  DocumentSelection,
  SelectionBounds,
} from "@/lib/document-selection";
import type { PdfTextRegion } from "@/lib/pdf-text-regions";

import {
  createSelectionImage,
  extractSelectedText,
} from "./selection-preparation";
import type { PagePoint, PageSize } from "./types";

const MINIMUM_SELECTION_SIZE = 0.01;

export function usePointerSelection({
  pageIndex,
  pageKey,
  selection,
  textRegions,
  visiblePageSize,
  surfaceRef,
  canvasRef,
  onSelectionChange,
}: {
  pageIndex: number;
  pageKey: string;
  selection: DocumentSelection | null;
  textRegions: PdfTextRegion[];
  visiblePageSize: PageSize | null;
  surfaceRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onSelectionChange: (selection: DocumentSelection | null) => void;
}) {
  const dragStartRef = useRef<{
    pageKey: string;
    point: PagePoint;
  } | null>(null);
  const [draftSelection, setDraftSelection] = useState<{
    pageKey: string;
    bounds: SelectionBounds | null;
  }>({
    pageKey,
    bounds: null,
  });

  const draftBounds =
    draftSelection.pageKey === pageKey ? draftSelection.bounds : null;

  function updateDraftBounds(bounds: SelectionBounds | null) {
    setDraftSelection({ pageKey, bounds });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !visiblePageSize) {
      return;
    }

    const point = getPagePoint(event);

    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pageKey, point };
    updateDraftBounds({ ...point, width: 0, height: 0 });
    onSelectionChange(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;

    if (!dragStart || dragStart.pageKey !== pageKey) {
      return;
    }

    const point = getPagePoint(event);

    if (point) {
      updateDraftBounds(getBounds(dragStart.point, point));
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;
    dragStartRef.current = null;

    if (!dragStart || dragStart.pageKey !== pageKey) {
      return;
    }

    const point = getPagePoint(event);
    const bounds = point ? getBounds(dragStart.point, point) : null;
    updateDraftBounds(null);

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

  function handlePointerCancel() {
    dragStartRef.current = null;
    updateDraftBounds(null);
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

  return {
    draftBounds,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    visibleBounds,
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

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

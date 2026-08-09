"use client";

import { usePointerSelection } from "./pdf-document-viewer/use-pointer-selection";
import { usePdfPageRendering } from "./pdf-document-viewer/use-pdf-page-rendering";
import { PdfViewerPresentation } from "./pdf-document-viewer/viewer-presentation";
import type { PdfDocumentViewerProps } from "./pdf-document-viewer/types";

export function PdfDocumentViewer({
  documentId,
  documentUrl,
  documentName,
  pageIndex,
  selection,
  tutorHighlightBounds,
  onSelectionChange,
}: PdfDocumentViewerProps) {
  const rendering = usePdfPageRendering({
    documentId,
    documentUrl,
    pageIndex,
    tutorHighlightBounds,
  });
  const pointerSelection = usePointerSelection({
    pageIndex,
    pageKey: rendering.pageKey,
    selection,
    textRegions: rendering.textRegions,
    visiblePageSize: rendering.visiblePageSize,
    surfaceRef: rendering.surfaceRef,
    canvasRef: rendering.canvasRef,
    onSelectionChange,
  });

  return (
    <PdfViewerPresentation
      containerRef={rendering.containerRef}
      surfaceRef={rendering.surfaceRef}
      canvasRef={rendering.canvasRef}
      documentName={documentName}
      pageIndex={pageIndex}
      error={rendering.error}
      visiblePageSize={rendering.visiblePageSize}
      isCurrentPageRendered={rendering.isCurrentPageRendered}
      tutorHighlightBounds={tutorHighlightBounds}
      visibleBounds={pointerSelection.visibleBounds}
      draftBounds={pointerSelection.draftBounds}
      onPointerDown={pointerSelection.handlePointerDown}
      onPointerMove={pointerSelection.handlePointerMove}
      onPointerUp={pointerSelection.handlePointerUp}
      onPointerCancel={pointerSelection.handlePointerCancel}
    />
  );
}

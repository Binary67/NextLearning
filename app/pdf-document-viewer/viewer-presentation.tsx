import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

import type { SelectionBounds } from "@/lib/document-selection";

import type { PageSize } from "./types";

export function PdfViewerPresentation({
  containerRef,
  surfaceRef,
  canvasRef,
  documentName,
  pageIndex,
  error,
  visiblePageSize,
  isCurrentPageRendered,
  tutorHighlightBounds,
  visibleBounds,
  draftBounds,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  documentName: string;
  pageIndex: number;
  error: string;
  visiblePageSize: PageSize | null;
  isCurrentPageRendered: boolean;
  tutorHighlightBounds: SelectionBounds[];
  visibleBounds: SelectionBounds | null;
  draftBounds: SelectionBounds | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
}) {
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
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

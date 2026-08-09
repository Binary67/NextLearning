import type { SelectionBounds } from "@/lib/document-selection";

export function createHighlightBoundsSignature(
  pageIndex: number,
  bounds: readonly SelectionBounds[],
) {
  const orderedBounds = [...bounds].sort(compareVisualBounds);

  return JSON.stringify([
    pageIndex,
    ...orderedBounds.map((bound) => [
      bound.x,
      bound.y,
      bound.width,
      bound.height,
    ]),
  ]);
}

export function findFirstVisualHighlight(
  bounds: readonly SelectionBounds[],
) {
  let firstHighlight: SelectionBounds | null = null;

  for (const bound of bounds) {
    if (!firstHighlight || compareVisualBounds(bound, firstHighlight) < 0) {
      firstHighlight = bound;
    }
  }

  return firstHighlight;
}

function compareVisualBounds(
  left: SelectionBounds,
  right: SelectionBounds,
) {
  return (
    left.y - right.y ||
    left.x - right.x ||
    left.width - right.width ||
    left.height - right.height
  );
}

export const VISUAL_GUIDE_GRID_SIZE = 4;

export const VISUAL_GUIDE_CELLS = [
  "A1",
  "A2",
  "A3",
  "A4",
  "B1",
  "B2",
  "B3",
  "B4",
  "C1",
  "C2",
  "C3",
  "C4",
  "D1",
  "D2",
  "D3",
  "D4",
] as const;

export type VisualGuideCell = (typeof VISUAL_GUIDE_CELLS)[number];

export type VisualGuideRegion = {
  start_cell: VisualGuideCell;
  end_cell: VisualGuideCell;
};

export type VisualGuideBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const visualGuideCellSet = new Set<string>(VISUAL_GUIDE_CELLS);

export function isVisualGuideCell(value: unknown): value is VisualGuideCell {
  return typeof value === "string" && visualGuideCellSet.has(value);
}

export function getVisualGuideBounds(
  region: VisualGuideRegion,
): VisualGuideBounds {
  const startIndex = VISUAL_GUIDE_CELLS.indexOf(region.start_cell);
  const endIndex = VISUAL_GUIDE_CELLS.indexOf(region.end_cell);
  const startRow = Math.floor(startIndex / VISUAL_GUIDE_GRID_SIZE);
  const startColumn = startIndex % VISUAL_GUIDE_GRID_SIZE;
  const endRow = Math.floor(endIndex / VISUAL_GUIDE_GRID_SIZE);
  const endColumn = endIndex % VISUAL_GUIDE_GRID_SIZE;
  const topRow = Math.min(startRow, endRow);
  const bottomRow = Math.max(startRow, endRow);
  const leftColumn = Math.min(startColumn, endColumn);
  const rightColumn = Math.max(startColumn, endColumn);

  return {
    x: leftColumn / VISUAL_GUIDE_GRID_SIZE,
    y: topRow / VISUAL_GUIDE_GRID_SIZE,
    width: (rightColumn - leftColumn + 1) / VISUAL_GUIDE_GRID_SIZE,
    height: (bottomRow - topRow + 1) / VISUAL_GUIDE_GRID_SIZE,
  };
}

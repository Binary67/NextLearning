import type { SelectionBounds } from "@/lib/document-selection";

export type PdfTextRegion = SelectionBounds & {
  text: string;
};

export type PdfTextRegionInput = {
  text: string;
  itemTransform: readonly number[];
  itemWidth: number;
  viewportTransform: readonly number[];
  viewportWidth: number;
  viewportHeight: number;
  viewportScale: number;
};

export function createPdfTextRegion(
  input: PdfTextRegionInput,
): PdfTextRegion | null {
  if (
    !input.text.trim() ||
    input.itemTransform.length < 6 ||
    input.viewportTransform.length < 6 ||
    input.itemWidth <= 0 ||
    input.viewportWidth <= 0 ||
    input.viewportHeight <= 0 ||
    input.viewportScale <= 0
  ) {
    return null;
  }

  const transform = composeTransforms(
    input.viewportTransform,
    input.itemTransform,
  );
  const baselineLength = Math.hypot(transform[0], transform[1]);
  const textHeight = Math.hypot(transform[2], transform[3]);

  if (
    !transform.every(Number.isFinite) ||
    baselineLength === 0 ||
    textHeight === 0
  ) {
    return null;
  }

  const width = input.itemWidth * input.viewportScale;
  const baselineX = (transform[0] / baselineLength) * width;
  const baselineY = (transform[1] / baselineLength) * width;
  const points = [
    [transform[4], transform[5]],
    [transform[4] + transform[2], transform[5] + transform[3]],
    [transform[4] + baselineX, transform[5] + baselineY],
    [
      transform[4] + transform[2] + baselineX,
      transform[5] + transform[3] + baselineY,
    ],
  ];
  const left = clamp(
    Math.min(...points.map(([x]) => x)) / input.viewportWidth,
  );
  const top = clamp(
    Math.min(...points.map(([, y]) => y)) / input.viewportHeight,
  );
  const right = clamp(
    Math.max(...points.map(([x]) => x)) / input.viewportWidth,
  );
  const bottom = clamp(
    Math.max(...points.map(([, y]) => y)) / input.viewportHeight,
  );

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    text: input.text,
  };
}

function composeTransforms(
  viewport: readonly number[],
  item: readonly number[],
) {
  return [
    viewport[0] * item[0] + viewport[2] * item[1],
    viewport[1] * item[0] + viewport[3] * item[1],
    viewport[0] * item[2] + viewport[2] * item[3],
    viewport[1] * item[2] + viewport[3] * item[3],
    viewport[0] * item[4] + viewport[2] * item[5] + viewport[4],
    viewport[1] * item[4] + viewport[3] * item[5] + viewport[5],
  ];
}

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

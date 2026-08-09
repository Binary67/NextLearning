import type { SelectionBounds } from "@/lib/document-selection";
import type { PdfTextRegion } from "@/lib/pdf-text-regions";

const MAXIMUM_SELECTION_IMAGE_BYTES = 48 * 1024;

export function extractSelectedText(
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

export function createSelectionImage(
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

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { SelectionBounds } from "@/lib/document-selection";
import type {
  GroundingTextRegion,
  PdfToken,
  RegionPlacement,
} from "@/lib/document-highlight-types";
import {
  createPdfTextRegion,
  type PdfTextRegion,
  type PdfTextRegionInput,
} from "@/lib/pdf-text-regions";

// Resolve from the project root rather than require.resolve: bundlers rewrite
// require.resolve("pdfjs-dist/...") in shared library code into virtual
// paths that do not exist on disk.
const standardFontDataUrl = pathToFileURL(
  path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "standard_fonts",
  ) + path.sep,
).href;

// pdf.js's Node factory reads font URLs with fs.readFile, which rejects
// file:// strings; read from the resolved directory with plain paths instead.
class LocalBinaryDataFactory {
  private readonly standardFontsDirectory: string;

  constructor({
    standardFontDataUrl: url,
  }: {
    cMapUrl?: string | null;
    standardFontDataUrl?: string | null;
    wasmUrl?: string | null;
  }) {
    if (!url) {
      throw new Error("The standardFontDataUrl API parameter is required.");
    }

    this.standardFontsDirectory = fileURLToPath(url);
  }

  async fetch({ kind, filename }: { kind: string; filename: string }) {
    if (kind !== "standardFontDataUrl") {
      throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`);
    }

    const data = await fs.readFile(
      path.join(this.standardFontsDirectory, filename),
    );
    return new Uint8Array(data);
  }
}

export function createHighlightBounds(
  regions: GroundingTextRegion[],
  pdfTokens: PdfToken[],
  matchingPdfTokenIndexes: number[],
) {
  const spans: number[][] = [];

  for (const pdfTokenIndex of matchingPdfTokenIndexes) {
    const currentSpan = spans.at(-1);

    if (
      !currentSpan ||
      hasGroundingGap(
        pdfTokens,
        currentSpan[currentSpan.length - 1],
        pdfTokenIndex,
      )
    ) {
      spans.push([pdfTokenIndex]);
    } else {
      currentSpan.push(pdfTokenIndex);
    }
  }

  return spans.flatMap((span) => {
    const regionRanges: Array<{
      regionIndex: number;
      startOffset: number;
      endOffset: number;
    }> = [];

    for (const pdfTokenIndex of span) {
      for (const fragment of pdfTokens[pdfTokenIndex].fragments) {
        const currentRange = regionRanges.at(-1);

        if (currentRange?.regionIndex === fragment.regionIndex) {
          currentRange.endOffset = fragment.endOffset;
        } else {
          regionRanges.push({ ...fragment });
        }
      }
    }

    const croppedRegions = regionRanges.map((range) =>
      cropRegion(
        regions[range.regionIndex],
        range.startOffset,
        range.endOffset,
      ),
    );

    return mergeTextRegionsByLine(croppedRegions);
  });
}

export async function extractPdfTextRegions(fileData: Buffer) {
  const pdfModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfModule.getDocument({
    data: new Uint8Array(fileData),
    standardFontDataUrl,
    BinaryDataFactory: LocalBinaryDataFactory,
  });

  try {
    const document = await loadingTask.promise;
    const pages: GroundingTextRegion[][] = [];

    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      pages.push(
        textContent.items.flatMap((item) => {
          if (!("str" in item)) {
            return [];
          }

          const input = {
            text: item.str,
            itemTransform: item.transform,
            itemWidth: item.width,
            viewportTransform: viewport.transform,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            viewportScale: viewport.scale,
          } satisfies PdfTextRegionInput;
          const region = createPdfTextRegion(input);

          if (!region) {
            return [];
          }

          return [
            {
              ...region,
              placement: createRegionPlacement(input),
            },
          ];
        }),
      );
    }

    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

function hasGroundingGap(
  pdfTokens: PdfToken[],
  previousIndex: number,
  currentIndex: number,
) {
  const currentFragments = pdfTokens[currentIndex].fragments;

  return pdfTokens
    .slice(previousIndex + 1, currentIndex)
    .some(
      (token) =>
        !token.synthetic &&
        !token.fragments.every((fragment) =>
          currentFragments.some(
            (current) =>
              current.regionIndex === fragment.regionIndex &&
              current.startOffset <= fragment.startOffset &&
              current.endOffset >= fragment.endOffset,
          ),
        ),
    );
}

function cropRegion(
  region: GroundingTextRegion,
  startOffset: number,
  endOffset: number,
): PdfTextRegion {
  const start = startOffset / region.text.length;
  const end = endOffset / region.text.length;

  if (!region.placement) {
    return {
      ...region,
      x: region.x + region.width * start,
      width: region.width * (end - start),
    };
  }

  const { baselineStart, baselineVector, heightVector } = region.placement;
  const points = [start, end].flatMap((fraction) => {
    const baseline = {
      x: baselineStart.x + baselineVector.x * fraction,
      y: baselineStart.y + baselineVector.y * fraction,
    };
    return [
      baseline,
      {
        x: baseline.x + heightVector.x,
        y: baseline.y + heightVector.y,
      },
    ];
  });
  const left = clamp(Math.min(...points.map((point) => point.x)));
  const top = clamp(Math.min(...points.map((point) => point.y)));
  const right = clamp(Math.max(...points.map((point) => point.x)));
  const bottom = clamp(Math.max(...points.map((point) => point.y)));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    text: region.text,
  };
}

function createRegionPlacement(
  input: PdfTextRegionInput,
): RegionPlacement {
  const transform = composeTransforms(
    input.viewportTransform,
    input.itemTransform,
  );
  const baselineLength = Math.hypot(transform[0], transform[1]);
  const width = input.itemWidth * input.viewportScale;

  return {
    baselineStart: {
      x: transform[4] / input.viewportWidth,
      y: transform[5] / input.viewportHeight,
    },
    baselineVector: {
      x: (transform[0] / baselineLength / input.viewportWidth) * width,
      y: (transform[1] / baselineLength / input.viewportHeight) * width,
    },
    heightVector: {
      x: transform[2] / input.viewportWidth,
      y: transform[3] / input.viewportHeight,
    },
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

function mergeTextRegionsByLine(textRegions: PdfTextRegion[]) {
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
  region: PdfTextRegion,
) {
  const verticalOverlap =
    Math.min(
      currentLine.y + currentLine.height,
      region.y + region.height,
    ) - Math.max(currentLine.y, region.y);
  const minimumHeight = Math.min(currentLine.height, region.height);
  const horizontalGap =
    region.x - (currentLine.x + currentLine.width);
  const referenceHeight = Math.max(currentLine.height, region.height);

  return (
    verticalOverlap >= minimumHeight * 0.45 &&
    horizontalGap >= -referenceHeight / 2 &&
    horizontalGap <= referenceHeight * 2
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

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

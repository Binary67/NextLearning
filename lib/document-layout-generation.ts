import path from "node:path";

import type { TextItem } from "pdfjs-dist/types/src/display/api";

import {
  DOCUMENT_LAYOUT_SCHEMA_VERSION,
  type DocumentLayout,
  type DocumentLayoutBlock,
  type DocumentLayoutBounds,
  type DocumentLayoutPage,
} from "@/lib/document-layout";

type TextSpan = {
  text: string;
  bounds: AbsoluteBounds;
  fontSize: number;
  hasEOL: boolean;
};

type TextLine = {
  text: string;
  bounds: AbsoluteBounds;
  fontSize: number;
};

type MutableTextBlock = TextLine & {
  lineCount: number;
  lastLine: TextLine;
};

type AbsoluteBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function generateDocumentLayout(
  file: File,
  documentId: string,
): Promise<DocumentLayout> {
  const pdfJsDataDirectory = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
  );
  const [{ getDocument, Util }, fileData] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    file.arrayBuffer(),
  ]);
  const loadingTask = getDocument({
    data: new Uint8Array(fileData),
    cMapUrl: `${path.join(pdfJsDataDirectory, "cmaps")}${path.sep}`,
    cMapPacked: true,
    standardFontDataUrl: `${path.join(pdfJsDataDirectory, "standard_fonts")}${path.sep}`,
    useWorkerFetch: false,
  });
  const pdfDocument = await loadingTask.promise;
  const pages: DocumentLayoutPage[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= pdfDocument.numPages; pageIndex += 1) {
      const page = await pdfDocument.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const spans = textContent.items.flatMap((item) => {
        if (!isTextItem(item) || item.str.trim().length === 0) {
          return [];
        }

        const transform = Util.transform(viewport.transform, item.transform);
        const bounds = getTextBounds(item, transform);

        if (bounds.width <= 0 || bounds.height <= 0) {
          return [];
        }

        return [
          {
            text: item.str,
            bounds,
            fontSize: bounds.height,
            hasEOL: item.hasEOL,
          },
        ];
      });
      const lines = buildTextLines(spans, viewport.width);
      const blocks = buildTextBlocks(lines).map((block, blockOffset) =>
        toLayoutBlock(
          block,
          pageIndex,
          blockOffset + 1,
          viewport.width,
          viewport.height,
        ),
      );

      pages.push({
        page_index: pageIndex,
        width: round(viewport.width),
        height: round(viewport.height),
        blocks,
      });
    }
  } finally {
    await loadingTask.destroy();
  }

  return {
    schema_version: DOCUMENT_LAYOUT_SCHEMA_VERSION,
    document_id: documentId,
    pages,
  };
}

function getTextBounds(
  item: TextItem,
  transform: number[],
): AbsoluteBounds {
  const angle = Math.atan2(transform[1], transform[0]);
  const width = item.width;
  const height = Math.hypot(transform[2], transform[3]) || item.height;
  const alongX = Math.cos(angle) * width;
  const alongY = Math.sin(angle) * width;
  const upX = Math.sin(angle) * height;
  const upY = -Math.cos(angle) * height;
  const x = transform[4];
  const y = transform[5];
  const corners = [
    [x, y],
    [x + alongX, y + alongY],
    [x + upX, y + upY],
    [x + alongX + upX, y + alongY + upY],
  ];
  const xValues = corners.map(([cornerX]) => cornerX);
  const yValues = corners.map(([, cornerY]) => cornerY);
  const left = Math.min(...xValues);
  const top = Math.min(...yValues);

  return {
    x: left,
    y: top,
    width: Math.max(...xValues) - left,
    height: Math.max(...yValues) - top,
  };
}

function buildTextLines(spans: TextSpan[], pageWidth: number) {
  const rows: Array<{ baseline: number; spans: TextSpan[] }> = [];
  const sortedSpans = [...spans].sort(
    (left, right) =>
      getBottom(left.bounds) - getBottom(right.bounds) ||
      left.bounds.x - right.bounds.x,
  );

  for (const span of sortedSpans) {
    const baseline = getBottom(span.bounds);
    const row = findMatchingRow(rows, span, baseline);

    if (row) {
      row.spans.push(span);
      row.baseline =
        row.spans.reduce(
          (total, item) => total + getBottom(item.bounds),
          0,
        ) / row.spans.length;
    } else {
      rows.push({ baseline, spans: [span] });
    }
  }

  return rows
    .flatMap((row) => splitRowIntoLines(row.spans, pageWidth))
    .sort(
      (left, right) =>
        left.bounds.y - right.bounds.y ||
        left.bounds.x - right.bounds.x,
    );
}

function findMatchingRow(
  rows: Array<{ baseline: number; spans: TextSpan[] }>,
  span: TextSpan,
  baseline: number,
) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const rowHeight = Math.max(
      ...row.spans.map((item) => item.bounds.height),
    );
    const tolerance = Math.max(2, Math.min(rowHeight, span.fontSize) * 0.4);

    if (Math.abs(row.baseline - baseline) <= tolerance) {
      return row;
    }

    if (baseline - row.baseline > Math.max(rowHeight, span.fontSize)) {
      break;
    }
  }

  return null;
}

function splitRowIntoLines(spans: TextSpan[], pageWidth: number) {
  const sortedSpans = [...spans].sort(
    (left, right) => left.bounds.x - right.bounds.x,
  );
  const segments: TextSpan[][] = [];
  let segment: TextSpan[] = [];

  for (const span of sortedSpans) {
    const previousSpan = segment.at(-1);
    const horizontalGap = previousSpan
      ? span.bounds.x - getRight(previousSpan.bounds)
      : 0;
    const splitThreshold = Math.max(
      pageWidth * 0.055,
      span.fontSize * 3,
      24,
    );

    if (
      previousSpan &&
      (horizontalGap > splitThreshold || previousSpan.hasEOL)
    ) {
      segments.push(segment);
      segment = [];
    }

    segment.push(span);
  }

  if (segment.length > 0) {
    segments.push(segment);
  }

  return segments.flatMap((items) => {
    const text = joinSpanText(items).trim();

    if (!text) {
      return [];
    }

    return [
      {
        text,
        bounds: unionBounds(items.map((item) => item.bounds)),
        fontSize: Math.max(...items.map((item) => item.fontSize)),
      },
    ];
  });
}

function joinSpanText(spans: TextSpan[]) {
  let text = "";

  for (const [index, span] of spans.entries()) {
    const previousSpan = spans[index - 1];

    if (
      previousSpan &&
      needsSpace(text, span.text, span.bounds.x - getRight(previousSpan.bounds))
    ) {
      text += " ";
    }

    text += span.text;
  }

  return text.replace(/\s+/g, " ");
}

function needsSpace(existingText: string, nextText: string, gap: number) {
  if (
    existingText.length === 0 ||
    /\s$/.test(existingText) ||
    /^\s|^[,.;:!?)}\]]/.test(nextText)
  ) {
    return false;
  }

  return gap > 1;
}

function buildTextBlocks(lines: TextLine[]) {
  const blocks: MutableTextBlock[] = [];

  for (const line of lines) {
    const block = findMatchingBlock(blocks, line);

    if (!block) {
      blocks.push({
        ...line,
        lineCount: 1,
        lastLine: line,
      });
      continue;
    }

    block.text += `\n${line.text}`;
    block.bounds = unionBounds([block.bounds, line.bounds]);
    block.fontSize = Math.max(block.fontSize, line.fontSize);
    block.lineCount += 1;
    block.lastLine = line;
  }

  return blocks.sort(
    (left, right) =>
      left.bounds.y - right.bounds.y ||
      left.bounds.x - right.bounds.x,
  );
}

function findMatchingBlock(
  blocks: MutableTextBlock[],
  line: TextLine,
) {
  let bestMatch: MutableTextBlock | null = null;
  let smallestGap = Number.POSITIVE_INFINITY;

  for (const block of blocks) {
    if (block.lineCount >= 10) {
      continue;
    }

    const previousLine = block.lastLine;
    const verticalGap = line.bounds.y - getBottom(previousLine.bounds);
    const maximumGap = Math.max(
      3,
      Math.min(line.fontSize, previousLine.fontSize) * 0.9,
    );
    const fontRatio =
      Math.max(line.fontSize, previousLine.fontSize) /
      Math.min(line.fontSize, previousLine.fontSize);
    const overlap = horizontalOverlap(line.bounds, previousLine.bounds);
    const leftAligned =
      Math.abs(line.bounds.x - previousLine.bounds.x) <=
      Math.max(8, line.fontSize);

    if (
      verticalGap < -2 ||
      verticalGap > maximumGap ||
      fontRatio > 1.35 ||
      (overlap < 0.5 && !leftAligned)
    ) {
      continue;
    }

    if (verticalGap < smallestGap) {
      bestMatch = block;
      smallestGap = verticalGap;
    }
  }

  return bestMatch;
}

function toLayoutBlock(
  block: MutableTextBlock,
  pageIndex: number,
  blockIndex: number,
  pageWidth: number,
  pageHeight: number,
): DocumentLayoutBlock {
  const bounds = normalizeBounds(block.bounds, pageWidth, pageHeight);

  return {
    id: `page:${String(pageIndex).padStart(4, "0")}:block:${String(blockIndex).padStart(4, "0")}`,
    text: block.text,
    bounds,
  };
}

function normalizeBounds(
  bounds: AbsoluteBounds,
  pageWidth: number,
  pageHeight: number,
): DocumentLayoutBounds {
  const x = clamp(bounds.x / pageWidth);
  const y = clamp(bounds.y / pageHeight);
  const right = clamp(getRight(bounds) / pageWidth);
  const bottom = clamp(getBottom(bounds) / pageHeight);

  return {
    x: round(x),
    y: round(y),
    width: round(Math.max(right - x, 0.000001)),
    height: round(Math.max(bottom - y, 0.000001)),
  };
}

function unionBounds(bounds: AbsoluteBounds[]): AbsoluteBounds {
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map(getRight));
  const bottom = Math.max(...bounds.map(getBottom));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function horizontalOverlap(
  left: AbsoluteBounds,
  right: AbsoluteBounds,
) {
  const overlap =
    Math.min(getRight(left), getRight(right)) -
    Math.max(left.x, right.x);

  if (overlap <= 0) {
    return 0;
  }

  return overlap / Math.min(left.width, right.width);
}

function getRight(bounds: AbsoluteBounds) {
  return bounds.x + bounds.width;
}

function getBottom(bounds: AbsoluteBounds) {
  return bounds.y + bounds.height;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function round(value: number) {
  return Number(value.toFixed(6));
}

function isTextItem(value: unknown): value is TextItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    typeof value.str === "string"
  );
}

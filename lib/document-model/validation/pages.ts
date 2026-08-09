import type { SelectionBounds } from "@/lib/document-selection";

import {
  isNonEmptyString,
  isPositiveInteger,
  isRecord,
} from "@/lib/document-model/validation/guards";

type ValidatedPage = {
  page_index: number;
  page_label: string;
  chunks: unknown[];
};

export function validatePages(
  pages: unknown[],
  requireHighlightBounds: boolean,
  startPage = 1,
) {
  const pageLabels = new Map<number, string>();
  const chunkIds = new Set<string>();
  let chunkCount = 0;

  for (const [index, page] of pages.entries()) {
    validatePage(page, startPage + index);

    pageLabels.set(page.page_index, page.page_label);

    for (const [chunkIndex, chunk] of page.chunks.entries()) {
      validatePageChunk(
        page.page_index,
        chunkIndex,
        chunk,
        requireHighlightBounds,
        chunkIds,
      );
      chunkCount += 1;
    }
  }

  if (chunkCount === 0) {
    throw new Error("The generated document model has invalid page chunks.");
  }

  return pageLabels;
}

function validatePage(
  page: unknown,
  expectedPageIndex: number,
): asserts page is ValidatedPage {
  if (
    !isRecord(page) ||
    page.page_index !== expectedPageIndex ||
    !isNonEmptyString(page.page_label) ||
    !Array.isArray(page.chunks) ||
    page.chunks.length > 3
  ) {
    throw new Error("The generated document model has an invalid page.");
  }
}

function validatePageChunk(
  pageIndex: number,
  chunkIndex: number,
  chunk: unknown,
  requireHighlightBounds: boolean,
  chunkIds: Set<string>,
) {
  if (!isRecord(chunk)) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      "the chunk must be an object",
    );
  }

  if (!isChunkId(chunk.id)) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      "id must be a lowercase kebab-case chunk ID",
    );
  }

  if (chunkIds.has(chunk.id)) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      "id is duplicated",
    );
  }

  if (!isNonEmptyString(chunk.section_title)) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      "section_title must be a non-empty string",
    );
  }

  const sourcesError = getChunkSourcesError(
    chunk.sources,
    pageIndex,
    requireHighlightBounds,
  );

  if (sourcesError) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      sourcesError,
    );
  }

  if (!isNonEmptyString(chunk.title)) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      "title must be a non-empty string",
    );
  }

  if (!isSourceSummary(chunk.summary)) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      "summary must contain 1 to 1600 characters",
    );
  }

  if (!isStringArray(chunk.concept_ids, 1, 12)) {
    throwInvalidPageChunk(
      pageIndex,
      chunkIndex,
      chunk,
      "concept_ids must contain 1 to 12 unique concept IDs",
    );
  }

  chunkIds.add(chunk.id);
}

function getChunkSourcesError(
  value: unknown,
  ownerPageIndex: number,
  requireHighlightBounds: boolean,
) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    return "sources must contain 1 to 4 ordered source spans";
  }

  let reachedOwnerPage = false;

  for (const [sourceIndex, source] of value.entries()) {
    if (!isRecord(source)) {
      return `source ${sourceIndex + 1} must be an object`;
    }

    if (
      !isPositiveInteger(source.page_index) ||
      (source.page_index !== ownerPageIndex &&
        source.page_index !== ownerPageIndex - 1)
    ) {
      return `source ${sourceIndex + 1} must belong to page ${ownerPageIndex} or its immediately previous page`;
    }

    if (source.page_index === ownerPageIndex) {
      reachedOwnerPage = true;
    } else if (reachedOwnerPage) {
      return "all previous-page sources must come before owning-page sources";
    }

    if (!isSourceText(source.source_text)) {
      return `source ${sourceIndex + 1} text must contain 1 to 8000 characters`;
    }

    if (
      requireHighlightBounds &&
      !isHighlightBounds(source.highlight_bounds)
    ) {
      return `source ${sourceIndex + 1} must have valid PDF highlight bounds`;
    }
  }

  return reachedOwnerPage
    ? null
    : `sources must include owning page ${ownerPageIndex}`;
}

function throwInvalidPageChunk(
  pageIndex: number,
  chunkIndex: number,
  chunk: unknown,
  reason: string,
): never {
  const chunkLabel =
    isRecord(chunk) && typeof chunk.id === "string"
      ? JSON.stringify(chunk.id)
      : `#${chunkIndex + 1}`;

  throw new Error(
    `The generated document model has an invalid page chunk on page ${pageIndex} (${chunkLabel}): ${reason}.`,
  );
}

function isHighlightBounds(value: unknown): value is SelectionBounds[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (bounds) =>
        isRecord(bounds) &&
        isUnitInterval(bounds.x) &&
        isUnitInterval(bounds.y) &&
        isPositiveUnitInterval(bounds.width) &&
        isPositiveUnitInterval(bounds.height) &&
        bounds.x + bounds.width <= 1 &&
        bounds.y + bounds.height <= 1,
    )
  );
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isPositiveUnitInterval(value: unknown): value is number {
  return typeof value === "number" && value > 0 && value <= 1;
}

function isChunkId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^chunk:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isStringArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function isSourceSummary(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= 1600;
}

function isSourceText(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= 8000;
}

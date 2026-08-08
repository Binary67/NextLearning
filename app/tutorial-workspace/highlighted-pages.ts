import type { DocumentChunk } from "@/lib/document-model";

export type HighlightedPageDirection = "previous" | "next";

export function getHighlightedSourcePages(
  chunk: DocumentChunk | null,
) {
  if (!chunk) {
    return [];
  }

  return [...new Set(chunk.sources.map((source) => source.page_index))].sort(
    (left, right) => left - right,
  );
}

export function getAdjacentHighlightedPage(
  sourcePages: number[],
  currentPage: number,
  direction: HighlightedPageDirection,
) {
  if (direction === "next") {
    return sourcePages.find((page) => page > currentPage) ?? null;
  }

  for (let index = sourcePages.length - 1; index >= 0; index -= 1) {
    const page = sourcePages[index];

    if (page < currentPage) {
      return page;
    }
  }

  return null;
}

export function formatHighlightedSourcePages(sourcePages: number[]) {
  if (sourcePages.length === 0) {
    return "";
  }

  if (sourcePages.length === 1) {
    return `Highlighted source: page ${sourcePages[0]}`;
  }

  const consecutive = sourcePages.every(
    (page, index) => index === 0 || page === sourcePages[index - 1] + 1,
  );
  const pages = consecutive
    ? `${sourcePages[0]}–${sourcePages[sourcePages.length - 1]}`
    : sourcePages.join(", ");

  return `Highlighted source: pages ${pages}`;
}

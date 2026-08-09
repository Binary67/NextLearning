import type { GeneratedDocumentSource } from "@/lib/document-model";
import { createHighlightBounds } from "@/lib/document-highlight-geometry";
import { tokenizeSourceText } from "@/lib/document-highlight-tokens";
import type {
  PdfToken,
  SearchablePage,
  SourceToken,
} from "@/lib/document-highlight-types";

const MAX_SKIPPED_SOURCE_TOKENS_PER_SOURCE = 3;

export function findSourceBounds(
  searchablePages: SearchablePage[],
  chunkId: string,
  sources: GeneratedDocumentSource[],
) {
  const pagesByIndex = new Map(
    searchablePages.map((page) => [page.pageIndex, page]),
  );
  const sourceTokens = sources.flatMap((source, sourceIndex) => {
    const page = pagesByIndex.get(source.page_index);

    if (!page) {
      throw groundingError(
        chunkId,
        sourceIndex,
        source.page_index,
        "page is not present in the attached PDF",
      );
    }

    const tokens = tokenizeSourceText(source.source_text);

    if (tokens.length === 0) {
      throw groundingError(
        chunkId,
        sourceIndex,
        source.page_index,
        "source has no normalized tokens",
      );
    }

    return tokens.map((token) => ({
      value: token.value,
      sourceIndex,
      pageIndex: source.page_index,
    }));
  });
  const sourcePages = new Set(
    sources.map((source) => source.page_index),
  );
  const pdfTokens = searchablePages
    .filter((page) => sourcePages.has(page.pageIndex))
    .flatMap((page) => page.tokens);
  const match = findBestAlignment(pdfTokens, sourceTokens);

  if (
    !match ||
    hasSourceWithoutMatchedTokens(match.alignment, sourceTokens)
  ) {
    throw createMissingAlignmentError(chunkId, pdfTokens, sourceTokens);
  }

  if (match.alternative) {
    const ambiguousTokenIndex = match.alignment.findIndex(
      (pdfTokenIndex, index) =>
        pdfTokenIndex !== match.alternative![index],
    );
    const token = sourceTokens[ambiguousTokenIndex];

    throw groundingError(
      chunkId,
      token.sourceIndex,
      token.pageIndex,
      "ordered token alignment is ambiguous",
    );
  }

  return sources.map((source, sourceIndex) => {
    const matchingPdfTokenIndexes = match.alignment.flatMap(
      (pdfTokenIndex, sourceTokenIndex) =>
        pdfTokenIndex !== null &&
        sourceTokens[sourceTokenIndex].sourceIndex === sourceIndex
          ? [pdfTokenIndex]
          : [],
    );
    const page = pagesByIndex.get(source.page_index)!;
    return createHighlightBounds(
      page.regions,
      pdfTokens,
      matchingPdfTokenIndexes,
    );
  });
}

type AlignmentResult = {
  alignment: Array<number | null>;
  alternative: Array<number | null> | null;
};

function findBestAlignment(
  pdfTokens: PdfToken[],
  sourceTokens: SourceToken[],
): AlignmentResult | null {
  let bestAlignment: Array<number | null> | null = null;
  let alternative: Array<number | null> | null = null;
  let bestSkippedCount = Number.POSITIVE_INFINITY;
  let bestSpanLength = Number.POSITIVE_INFINITY;

  for (let start = 0; start < pdfTokens.length; start += 1) {
    if (!tokensMatch(pdfTokens[start], sourceTokens[0])) {
      continue;
    }

    const result = findTolerantAlignment(pdfTokens, sourceTokens, start);

    if (!result) {
      continue;
    }

    const spanLength =
      lastMatchedPdfTokenIndex(result.alignment) - start + 1;

    if (
      result.skippedCount < bestSkippedCount ||
      (result.skippedCount === bestSkippedCount &&
        spanLength < bestSpanLength)
    ) {
      bestAlignment = result.alignment;
      alternative = null;
      bestSkippedCount = result.skippedCount;
      bestSpanLength = spanLength;
    } else if (
      result.skippedCount === bestSkippedCount &&
      spanLength === bestSpanLength
    ) {
      alternative = result.alignment;
    }
  }

  return bestAlignment
    ? { alignment: bestAlignment, alternative }
    : null;
}

function findTolerantAlignment(
  pdfTokens: PdfToken[],
  sourceTokens: SourceToken[],
  start: number,
): { alignment: Array<number | null>; skippedCount: number } | null {
  const alignment: Array<number | null> = new Array(sourceTokens.length).fill(
    null,
  );
  const skippedBySource = new Map<number, number>();

  function walk(sourceIndex: number, pdfIndex: number): boolean {
    if (sourceIndex === sourceTokens.length) {
      return true;
    }

    const sourceToken = sourceTokens[sourceIndex];
    let matchedPdfIndex = pdfIndex;

    while (
      matchedPdfIndex < pdfTokens.length &&
      !tokensMatch(pdfTokens[matchedPdfIndex], sourceToken)
    ) {
      matchedPdfIndex += 1;
    }

    if (matchedPdfIndex < pdfTokens.length) {
      alignment[sourceIndex] = matchedPdfIndex;

      if (walk(sourceIndex + 1, matchedPdfIndex + 1)) {
        return true;
      }

      alignment[sourceIndex] = null;
    }

    const skippedCount = skippedBySource.get(sourceToken.sourceIndex) ?? 0;

    if (skippedCount < MAX_SKIPPED_SOURCE_TOKENS_PER_SOURCE) {
      skippedBySource.set(sourceToken.sourceIndex, skippedCount + 1);

      if (walk(sourceIndex + 1, pdfIndex)) {
        return true;
      }

      skippedBySource.set(sourceToken.sourceIndex, skippedCount);
    }

    return false;
  }

  if (!walk(0, start)) {
    return null;
  }

  return {
    alignment,
    skippedCount: alignment.filter((value) => value === null).length,
  };
}

function lastMatchedPdfTokenIndex(alignment: Array<number | null>) {
  for (let index = alignment.length - 1; index >= 0; index -= 1) {
    const pdfTokenIndex = alignment[index];

    if (pdfTokenIndex !== null && pdfTokenIndex !== undefined) {
      return pdfTokenIndex;
    }
  }

  return -1;
}

function hasSourceWithoutMatchedTokens(
  alignment: Array<number | null>,
  sourceTokens: SourceToken[],
) {
  return sourceTokens.some(
    (sourceToken, index) =>
      alignment[index] === null &&
      !alignment.some(
        (pdfTokenIndex, otherIndex) =>
          pdfTokenIndex !== null &&
          sourceTokens[otherIndex].sourceIndex === sourceToken.sourceIndex,
      ),
  );
}

function createMissingAlignmentError(
  chunkId: string,
  pdfTokens: PdfToken[],
  sourceTokens: SourceToken[],
) {
  const missingTokenIndex = findFirstMissingTokenIndex(
    pdfTokens,
    sourceTokens,
  );
  const sourceToken = sourceTokens[missingTokenIndex];
  const appearsOnPage = pdfTokens.some(
    (pdfToken) => tokensMatch(pdfToken, sourceToken),
  );
  const reason = appearsOnPage
    ? `source token "${sourceToken.value}" violates source order or non-overlap`
    : `source token "${sourceToken.value}" is missing from the PDF page`;

  return groundingError(
    chunkId,
    sourceToken.sourceIndex,
    sourceToken.pageIndex,
    reason,
  );
}

function findFirstMissingTokenIndex(
  pdfTokens: PdfToken[],
  sourceTokens: SourceToken[],
) {
  let pdfTokenIndex = 0;

  for (
    let sourceTokenIndex = 0;
    sourceTokenIndex < sourceTokens.length;
    sourceTokenIndex += 1
  ) {
    while (
      pdfTokenIndex < pdfTokens.length &&
      !tokensMatch(pdfTokens[pdfTokenIndex], sourceTokens[sourceTokenIndex])
    ) {
      pdfTokenIndex += 1;
    }

    if (pdfTokenIndex === pdfTokens.length) {
      return sourceTokenIndex;
    }

    pdfTokenIndex += 1;
  }

  throw new Error("Expected an incomplete source alignment.");
}

function groundingError(
  chunkId: string,
  sourceIndex: number,
  pageIndex: number,
  reason: string,
) {
  return new Error(
    `Chunk ${chunkId}, source ${sourceIndex + 1}, PDF page ${pageIndex}: ${reason}.`,
  );
}

function tokensMatch(pdfToken: PdfToken, sourceToken: SourceToken) {
  return (
    pdfToken.pageIndex === sourceToken.pageIndex &&
    pdfToken.value === sourceToken.value
  );
}

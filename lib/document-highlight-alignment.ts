import type { GeneratedDocumentSource } from "@/lib/document-model";
import { createHighlightBounds } from "@/lib/document-highlight-geometry";
import { tokenizeSourceText } from "@/lib/document-highlight-tokens";
import type {
  PdfToken,
  SearchablePage,
  SourceToken,
} from "@/lib/document-highlight-types";

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

  if (!match) {
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
    const matchingPdfTokenIndexes = match.alignment.filter(
      (_, sourceTokenIndex) =>
        sourceTokens[sourceTokenIndex].sourceIndex === sourceIndex,
    );
    const page = pagesByIndex.get(source.page_index)!;
    return createHighlightBounds(
      page.regions,
      pdfTokens,
      matchingPdfTokenIndexes,
    );
  });
}

function findBestAlignment(
  pdfTokens: PdfToken[],
  sourceTokens: SourceToken[],
) {
  let bestAlignment: number[] | null = null;
  let alternative: number[] | null = null;
  let bestSpanLength = Number.POSITIVE_INFINITY;

  for (let start = 0; start < pdfTokens.length; start += 1) {
    if (!tokensMatch(pdfTokens[start], sourceTokens[0])) {
      continue;
    }

    const alignment = [start];
    let pdfTokenIndex = start + 1;

    for (
      let sourceTokenIndex = 1;
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
        break;
      }

      alignment.push(pdfTokenIndex);
      pdfTokenIndex += 1;
    }

    if (alignment.length !== sourceTokens.length) {
      continue;
    }

    const spanLength = alignment.at(-1)! - start + 1;

    if (spanLength < bestSpanLength) {
      bestAlignment = alignment;
      alternative = null;
      bestSpanLength = spanLength;
    } else if (spanLength === bestSpanLength) {
      alternative = alignment;
    }
  }

  return bestAlignment
    ? { alignment: bestAlignment, alternative }
    : null;
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

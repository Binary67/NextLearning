import type {
  DocumentModel,
  GeneratedDocumentModel,
  GeneratedDocumentSource,
} from "@/lib/document-model";
import type { SelectionBounds } from "@/lib/document-selection";
import {
  createPdfTextRegion,
  type PdfTextRegion,
  type PdfTextRegionInput,
} from "@/lib/pdf-text-regions";

export type { PdfTextRegion } from "@/lib/pdf-text-regions";

type Point = {
  x: number;
  y: number;
};

type RegionPlacement = {
  baselineStart: Point;
  baselineVector: Point;
  heightVector: Point;
};

type GroundingTextRegion = PdfTextRegion & {
  placement?: RegionPlacement;
};

type PdfToken = {
  value: string;
  pageIndex: number;
  fragments: TokenFragment[];
  synthetic?: boolean;
};

type TokenFragment = {
  regionIndex: number;
  startOffset: number;
  endOffset: number;
};

type SourceToken = {
  value: string;
  sourceIndex: number;
  pageIndex: number;
};

type SearchablePage = {
  pageIndex: number;
  regions: GroundingTextRegion[];
  tokens: PdfToken[];
};

type TextToken = {
  value: string;
  startOffset: number;
  endOffset: number;
};

const TOKEN_PATTERN =
  /[\p{L}\p{M}\p{N}]+(?:[\p{Pd}\u2212][\p{L}\p{M}\p{N}]+)*|[\p{P}\p{S}]+/gu;
const DASH_PATTERN = /[\p{Pd}\u2212]/u;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{M}\p{N}]/u;

export async function addDocumentHighlightBounds(
  fileData: Buffer,
  model: GeneratedDocumentModel,
  inputStartPage = 1,
): Promise<DocumentModel> {
  const textRegionsByPage = await extractPdfTextRegions(fileData);
  const searchablePages = textRegionsByPage.map((regions, pageOffset) =>
    createSearchablePage(regions, inputStartPage + pageOffset),
  );

  return {
    ...model,
    pages: model.pages.map((page) => ({
      ...page,
      chunks: page.chunks.map((chunk) => {
        const boundsBySource = findSourceBounds(
          searchablePages,
          chunk.id,
          chunk.sources,
        );

        return {
          ...chunk,
          sources: chunk.sources.map((source, sourceIndex) => ({
            ...source,
            highlight_bounds: boundsBySource[sourceIndex],
          })),
        };
      }),
    })),
  };
}

export function findDocumentHighlightBounds(
  textRegions: PdfTextRegion[],
  sourceText: string,
) {
  try {
    return findSourceBounds(
      [createSearchablePage(textRegions, 1)],
      "source",
      [{ page_index: 1, source_text: sourceText }],
    )[0];
  } catch {
    return null;
  }
}

function findSourceBounds(
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

function createSearchablePage(
  textRegions: PdfTextRegion[],
  pageIndex: number,
): SearchablePage {
  const regions = textRegions as GroundingTextRegion[];
  const tokens = regions.flatMap((region, regionIndex) =>
    tokenize(region.text).map((token) => ({
      value: token.value,
      pageIndex,
      fragments: [
        {
          regionIndex,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
        },
      ],
    })),
  );

  return {
    pageIndex,
    regions,
    tokens: addAlternatePdfTokens(tokens, regions),
  };
}

function tokenize(value: string): TextToken[] {
  return Array.from(value.matchAll(TOKEN_PATTERN), (match) => {
    const matchedText = match[0];
    const normalized = matchedText
      .toLocaleLowerCase("en-US")
      .normalize("NFKD");
    const value = WORD_CHARACTER_PATTERN.test(normalized[0])
      ? normalized.replace(/[\p{Pd}\u2212]/gu, "")
      : normalizePunctuation(normalized);
    const startOffset = match.index;

    return {
      value,
      startOffset,
      endOffset: startOffset + matchedText.length,
    };
  });
}

function normalizePunctuation(value: string) {
  return Array.from(value, normalizePunctuationCharacter).join("");
}

function normalizePunctuationCharacter(value: string) {
  if (DASH_PATTERN.test(value)) {
    return "-";
  }

  if (/[‘’‚‛`´]/u.test(value)) {
    return "'";
  }

  if (/[“”„‟]/u.test(value)) {
    return '"';
  }

  return value;
}

function tokenizeSourceText(value: string) {
  const dehyphenated = value.replace(
    /([\p{L}\p{M}\p{N}])[\p{Pd}\u2212](?:\r\n|[\r\n])(?=[\p{L}\p{M}\p{N}])/gu,
    "$1",
  );
  return tokenize(dehyphenated);
}

function addAlternatePdfTokens(
  tokens: PdfToken[],
  regions: GroundingTextRegion[],
) {
  const alternatesByEndIndex = new Map<number, PdfToken[]>();

  function addAlternate(endIndex: number, token: PdfToken) {
    const alternates = alternatesByEndIndex.get(endIndex) ?? [];
    alternates.push({ ...token, synthetic: true });
    alternatesByEndIndex.set(endIndex, alternates);
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    const first = tokens[index];
    const hyphen = tokens[index + 1];
    const second = tokens[index + 2];
    const firstFragment = first.fragments.at(-1);
    const hyphenFragment = hyphen?.fragments[0];
    const secondFragment = second?.fragments[0];
    const firstRegion = firstFragment
      ? regions[firstFragment.regionIndex]
      : null;

    if (
      firstRegion &&
      hyphen?.value === "-" &&
      firstFragment?.regionIndex === hyphenFragment?.regionIndex &&
      secondFragment &&
      secondFragment.regionIndex !== firstFragment.regionIndex &&
      DASH_PATTERN.test(firstRegion.text.at(-1) ?? "") &&
      WORD_CHARACTER_PATTERN.test(second.value[0])
    ) {
      addAlternate(index + 2, {
        value: first.value + second.value,
        pageIndex: first.pageIndex,
        fragments: [...first.fragments, ...second.fragments],
      });
    }
  }

  for (let start = 0; start < tokens.length - 1; start += 1) {
    const first = tokens[start];

    if (!WORD_CHARACTER_PATTERN.test(first.value[0])) {
      continue;
    }

    let value = first.value;
    let wordCount = 1;
    const fragments = [...first.fragments];

    for (
      let end = start + 1;
      end < Math.min(tokens.length, start + 4);
      end += 1
    ) {
      const previous = tokens[end - 1];
      const current = tokens[end];

      if (
        !tokensAreVisuallyAdjacent(previous, current, regions) ||
        (!WORD_CHARACTER_PATTERN.test(current.value[0]) &&
          current.value !== "-")
      ) {
        break;
      }

      fragments.push(...current.fragments);

      if (WORD_CHARACTER_PATTERN.test(current.value[0])) {
        value += current.value;
        wordCount += 1;
      }

      if (wordCount > 1) {
        addAlternate(end, {
          value,
          pageIndex: first.pageIndex,
          fragments: [...fragments],
        });
      }
    }
  }

  for (let start = 0; start < tokens.length - 1; start += 1) {
    const first = tokens[start];

    if (WORD_CHARACTER_PATTERN.test(first.value[0])) {
      continue;
    }

    let value = first.value;
    const fragments = [...first.fragments];

    for (
      let end = start + 1;
      end < Math.min(tokens.length, start + 4);
      end += 1
    ) {
      const current = tokens[end];

      if (
        WORD_CHARACTER_PATTERN.test(current.value[0]) ||
        !tokensAreVisuallyAdjacent(tokens[end - 1], current, regions)
      ) {
        break;
      }

      value += current.value;
      fragments.push(...current.fragments);
      addAlternate(end, {
        value,
        pageIndex: first.pageIndex,
        fragments: [...fragments],
      });
    }
  }

  return tokens.flatMap((token, index) => [
    token,
    ...(alternatesByEndIndex.get(index) ?? []),
  ]);
}

function tokensAreVisuallyAdjacent(
  left: PdfToken,
  right: PdfToken,
  regions: GroundingTextRegion[],
) {
  const leftFragment = left.fragments.at(-1);
  const rightFragment = right.fragments[0];

  if (
    !leftFragment ||
    !rightFragment ||
    leftFragment.regionIndex === rightFragment.regionIndex
  ) {
    return false;
  }

  const leftRegion = regions[leftFragment.regionIndex];
  const rightRegion = regions[rightFragment.regionIndex];
  const verticalOverlap =
    Math.min(
      leftRegion.y + leftRegion.height,
      rightRegion.y + rightRegion.height,
    ) - Math.max(leftRegion.y, rightRegion.y);
  const minimumHeight = Math.min(leftRegion.height, rightRegion.height);
  const horizontalGap =
    rightRegion.x - (leftRegion.x + leftRegion.width);
  const referenceHeight = Math.max(leftRegion.height, rightRegion.height);

  return (
    verticalOverlap >= minimumHeight * 0.45 &&
    Math.abs(horizontalGap) <= referenceHeight * 0.15
  );
}

function createHighlightBounds(
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

async function extractPdfTextRegions(fileData: Buffer) {
  const pdfModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfModule.getDocument({
    data: new Uint8Array(fileData),
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

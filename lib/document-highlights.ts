import type {
  DocumentModel,
  GeneratedDocumentModel,
} from "@/lib/document-model";
import type { SelectionBounds } from "@/lib/document-selection";

export type PdfTextRegion = SelectionBounds & {
  text: string;
};

type SearchablePage = {
  text: string;
  regionIndexes: number[];
  textRegions: PdfTextRegion[];
};

const MINIMUM_PARTIAL_MATCH_CHARACTERS = 48;
const MINIMUM_PARTIAL_MATCH_COVERAGE = 0.35;

export async function addDocumentHighlightBounds(
  fileData: Buffer,
  model: GeneratedDocumentModel,
): Promise<DocumentModel> {
  const textRegionsByPage = await extractPdfTextRegions(fileData);
  const searchablePages = textRegionsByPage.map(createSearchablePage);

  return {
    ...model,
    pages: model.pages.map((page) => {
      return {
        ...page,
        chunks: page.chunks.map((chunk) => {
          return {
            ...chunk,
            sources: chunk.sources.map((source) => {
              const searchablePage =
                searchablePages[source.page_index - 1];
              const highlightBounds = searchablePage
                ? findHighlightBoundsOnSearchablePage(
                    searchablePage,
                    source.source_text,
                  )
                : null;

              if (!highlightBounds) {
                throw new Error(
                  `Chunk ${chunk.id} could not be uniquely anchored on PDF page ${source.page_index}.`,
                );
              }

              return {
                ...source,
                highlight_bounds: highlightBounds,
              };
            }),
          };
        }),
      };
    }),
  };
}

export function findDocumentHighlightBounds(
  textRegions: PdfTextRegion[],
  sourceText: string,
) {
  return findHighlightBoundsOnSearchablePage(
    createSearchablePage(textRegions),
    sourceText,
  );
}

function findHighlightBoundsOnSearchablePage(
  searchablePage: SearchablePage,
  sourceText: string,
) {
  const query = canonicalizeText(sourceText);

  if (!query || searchablePage.textRegions.length === 0) {
    return null;
  }

  const match = findUniqueTextMatch(searchablePage.text, query);

  if (!match) {
    return null;
  }

  const matchingRegionIndexes = new Set(
    searchablePage.regionIndexes.slice(
      match.start,
      match.start + match.length,
    ),
  );
  const matchingRegions = Array.from(matchingRegionIndexes, (index) => {
    return searchablePage.textRegions[index];
  });

  return mergeTextRegionsByLine(matchingRegions);
}

function findUniqueTextMatch(pageText: string, query: string) {
  const exactMatch = findUniqueOccurrence(pageText, query);

  if (exactMatch) {
    return exactMatch;
  }

  const prefixMatch = findLongestEdgeMatch(pageText, query, "prefix");
  const suffixMatch = findLongestEdgeMatch(pageText, query, "suffix");
  const partialMatch =
    (prefixMatch?.length ?? 0) >= (suffixMatch?.length ?? 0)
      ? prefixMatch
      : suffixMatch;

  if (
    !partialMatch ||
    partialMatch.length < MINIMUM_PARTIAL_MATCH_CHARACTERS ||
    partialMatch.length / query.length < MINIMUM_PARTIAL_MATCH_COVERAGE
  ) {
    return null;
  }

  return partialMatch;
}

function findLongestEdgeMatch(
  pageText: string,
  query: string,
  edge: "prefix" | "suffix",
) {
  let minimumLength = 1;
  let maximumLength = query.length - 1;
  let matchLength = 0;

  while (minimumLength <= maximumLength) {
    const length = Math.floor((minimumLength + maximumLength) / 2);
    const candidate =
      edge === "prefix" ? query.slice(0, length) : query.slice(-length);

    if (pageText.includes(candidate)) {
      matchLength = length;
      minimumLength = length + 1;
    } else {
      maximumLength = length - 1;
    }
  }

  if (matchLength === 0) {
    return null;
  }

  const candidate =
    edge === "prefix"
      ? query.slice(0, matchLength)
      : query.slice(-matchLength);
  return findUniqueOccurrence(pageText, candidate);
}

function findUniqueOccurrence(pageText: string, query: string) {
  const start = pageText.indexOf(query);

  if (start === -1 || pageText.indexOf(query, start + 1) !== -1) {
    return null;
  }

  return {
    start,
    length: query.length,
  };
}

function createSearchablePage(textRegions: PdfTextRegion[]) {
  let text = "";
  const regionIndexes: number[] = [];

  textRegions.forEach((region, regionIndex) => {
    const normalizedText = canonicalizeText(region.text);
    text += normalizedText;

    for (let index = 0; index < normalizedText.length; index += 1) {
      regionIndexes.push(regionIndex);
    }
  });

  return { text, regionIndexes, textRegions } satisfies SearchablePage;
}

function canonicalizeText(value: string) {
  return Array.from(value.normalize("NFKD").toLowerCase())
    .filter((character) => /[\p{L}\p{N}]/u.test(character))
    .join("");
}

async function extractPdfTextRegions(fileData: Buffer) {
  const pdfModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfModule.getDocument({
    data: new Uint8Array(fileData),
  });

  try {
    const document = await loadingTask.promise;
    const pages: PdfTextRegion[][] = [];

    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      pages.push(
        textContent.items.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) {
            return [];
          }

          const transform = pdfModule.Util.transform(
            viewport.transform,
            item.transform,
          );
          const height = Math.hypot(transform[2], transform[3]);
          const left = clamp(transform[4] / viewport.width);
          const top = clamp(
            (transform[5] - height) / viewport.height,
          );
          const right = clamp(
            (transform[4] + item.width * viewport.scale) /
              viewport.width,
          );
          const bottom = clamp(transform[5] / viewport.height);

          if (right <= left || bottom <= top) {
            return [];
          }

          return [
            {
              x: left,
              y: top,
              width: right - left,
              height: bottom - top,
              text: item.str,
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

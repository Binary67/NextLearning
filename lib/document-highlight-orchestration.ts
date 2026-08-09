import type {
  DocumentModel,
  GeneratedDocumentModel,
} from "@/lib/document-model";
import { findSourceBounds } from "@/lib/document-highlight-alignment";
import { createSearchablePage } from "@/lib/document-highlight-tokens";
import { extractPdfTextRegions } from "@/lib/document-highlight-geometry";
import type { PdfTextRegion } from "@/lib/pdf-text-regions";

export async function addDocumentHighlightBounds(
  fileData: Buffer,
  model: GeneratedDocumentModel,
  inputStartPage = 1,
  textRegionsByPage?: PdfTextRegion[][],
): Promise<DocumentModel> {
  const extractedRegions =
    textRegionsByPage ?? (await extractPdfTextRegions(fileData));
  const searchablePages = extractedRegions.map((regions, pageOffset) =>
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

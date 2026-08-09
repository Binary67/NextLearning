import { describe, expect, it } from "vitest";

import type { GroundedGeneratedDocumentBatch } from "@/lib/document-batches";

import { consolidateDocumentBatches } from "@/lib/document-consolidation";

describe("document consolidation", () => {
  it("builds prefix models with stable page and concept IDs", async () => {
    const firstBatch = createBatch(1, 1, 10, "concept:first");
    const secondBatch = createBatch(2, 11, 20, "concept:second");

    const prefix = await consolidateDocumentBatches(
      "tutorial",
      20,
      [firstBatch],
    );
    const complete = await consolidateDocumentBatches(
      "tutorial",
      20,
      [secondBatch, firstBatch],
    );

    expect(prefix.page_count).toBe(10);
    expect(complete.page_count).toBe(20);
    expect(
      complete.pages.slice(0, 10).map((page) =>
        page.chunks.map(({ id }) => id),
      ),
    ).toEqual(
      prefix.pages.map((page) => page.chunks.map(({ id }) => id)),
    );
    expect(complete.concepts[0].id).toBe(prefix.concepts[0].id);
    expect(complete.concepts[0].occurrences).toHaveLength(20);
  });
});

function createBatch(
  batchIndex: number,
  startPage: number,
  endPage: number,
  conceptId: string,
): GroundedGeneratedDocumentBatch {
  const pages = Array.from(
    { length: endPage - startPage + 1 },
    (_, pageOffset) => {
      const pageIndex = startPage + pageOffset;

      return {
        page_index: pageIndex,
        page_label: String(pageIndex),
        chunks: [
          {
            id: `chunk:page-${pageIndex}`,
            section_title: "Section",
            sources: [
              {
                page_index: pageIndex,
                source_text: `Source ${pageIndex}`,
                highlight_bounds: [
                  { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
                ],
              },
            ],
            title: `Page ${pageIndex}`,
            summary: "Summary",
            concept_ids: [conceptId],
          },
        ],
      };
    },
  );

  return {
    schema_version: 5,
    document_id: "tutorial",
    batch_index: batchIndex,
    start_page: startPage,
    end_page: endPage,
    title: "Document",
    page_count: 20,
    pages,
    concepts: [
      {
        id: conceptId,
        name: "Shared concept",
        definition: "Definition",
        occurrences: pages.map((page) => ({
          page_index: page.page_index,
          page_label: page.page_label,
          role: "introduced" as const,
          explicitness: "explicit" as const,
          confidence: 1,
        })),
      },
    ],
    connections: [],
  };
}

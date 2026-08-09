import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { addDocumentHighlightBounds } from "@/lib/document-highlight-orchestration";
import type { GeneratedDocumentModel } from "@/lib/document-model";

describe("PDF source grounding fixture", () => {
  it("extracts and grounds a complete source on each PDF page", async () => {
    const fileData = await readFile(
      new URL("./fixtures/document-grounding.pdf", import.meta.url),
    );
    const model: GeneratedDocumentModel = {
      schema_version: 5,
      document_id: "fixture-document",
      title: "Grounding fixture",
      page_count: 2,
      pages: [
        {
          page_index: 1,
          page_label: "1",
          chunks: [],
        },
        {
          page_index: 2,
          page_label: "2",
          chunks: [
            {
              id: "chunk:p2-grounding",
              section_title: "Fixture",
              sources: [
                {
                  page_index: 1,
                  source_text: "The passage begins on page one.",
                },
                {
                  page_index: 2,
                  source_text: "It concludes completely on page two.",
                },
              ],
              title: "Two-page grounding",
              summary: "A representative two-page source.",
              concept_ids: [],
            },
          ],
        },
      ],
      concepts: [],
      connections: [],
    };

    const result = await addDocumentHighlightBounds(fileData, model);

    expect(result.pages[1].chunks[0].sources).toEqual([
      expect.objectContaining({ highlight_bounds: [expect.any(Object)] }),
      expect.objectContaining({ highlight_bounds: [expect.any(Object)] }),
    ]);
  });
});

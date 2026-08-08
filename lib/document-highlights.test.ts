import { describe, expect, it, vi } from "vitest";

import {
  addDocumentHighlightBounds,
  findDocumentHighlightBounds,
  type PdfTextRegion,
} from "@/lib/document-highlights";
import type { GeneratedDocumentModel } from "@/lib/document-model";

const { getDocument } = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument,
  Util: {
    transform: (_viewportTransform: number[], itemTransform: number[]) =>
      itemTransform,
  },
}));

describe("addDocumentHighlightBounds", () => {
  it("reuses one searchable representation for sources on the same page", async () => {
    const textItems = [
      pdfTextItem("First searchable source", 10, 70),
      pdfTextItem("Second searchable source", 10, 60),
    ];
    const sources = [
      {
        page_index: 1,
        source_text: "First searchable source",
      },
      {
        page_index: 1,
        source_text: "Second searchable source",
      },
    ];
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({
            width: 100,
            height: 100,
            scale: 1,
            transform: [1, 0, 0, 1, 0, 0],
          }),
          getTextContent: () =>
            Promise.resolve({
              items: textItems,
            }),
        }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });
    const normalize = vi.spyOn(String.prototype, "normalize");
    const model: GeneratedDocumentModel = {
      schema_version: 5,
      document_id: "document-1",
      title: "Document",
      page_count: 1,
      pages: [
        {
          page_index: 1,
          page_label: "1",
          chunks: [
            {
              id: "chunk-1",
              section_title: "Section",
              title: "Chunk",
              summary: "Summary",
              concept_ids: [],
              sources,
            },
          ],
        },
      ],
      concepts: [],
      connections: [],
    };

    const result = await addDocumentHighlightBounds(
      Buffer.from("pdf"),
      model,
    );

    expect(result.pages[0].chunks[0].sources).toEqual([
      expect.objectContaining({ highlight_bounds: [expect.any(Object)] }),
      expect.objectContaining({ highlight_bounds: [expect.any(Object)] }),
    ]);
    expect(normalize).toHaveBeenCalledTimes(
      textItems.length + sources.length,
    );
    normalize.mockRestore();
  });
});

describe("findDocumentHighlightBounds", () => {
  it("anchors text across Unicode and PDF punctuation differences", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("English- ", 0.1, 0.2, 0.18),
        region("to-\uFB01t systems", 0.29, 0.2, 0.22),
      ],
      "English\uFFFEto–fit systems",
    );

    expect(bounds).toHaveLength(1);
    expect(bounds?.[0]).toMatchObject({
      y: expect.any(Number),
      width: expect.any(Number),
    });
  });

  it("anchors the visible edge of a passage split across PDF pages", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region(
          "of the values, where the weight assigned to each value",
          0.1,
          0.2,
          0.5,
        ),
        region(
          "is computed by a compatibility function of the query.",
          0.1,
          0.24,
          0.46,
        ),
      ],
      [
        "An attention function maps a query and key-value pairs to an output.",
        "The output is computed as a weighted sum of the values, where the",
        "weight assigned to each value is computed by a compatibility",
        "function of the query.",
      ].join(" "),
    );

    expect(bounds).toHaveLength(2);
  });

  it("rejects ambiguous passages", () => {
    const repeatedText =
      "This repeated passage is long enough to be a valid source segment.";
    const regions: PdfTextRegion[] = [
      region(repeatedText, 0.1, 0.2, 0.5),
      region(repeatedText, 0.1, 0.3, 0.5),
    ];

    expect(
      findDocumentHighlightBounds(regions, repeatedText),
    ).toBeNull();
  });
});

function region(
  text: string,
  x: number,
  y: number,
  width: number,
): PdfTextRegion {
  return {
    x,
    y,
    width,
    height: 0.02,
    text,
  };
}

function pdfTextItem(text: string, x: number, y: number) {
  return {
    str: text,
    transform: [1, 0, 0, 1, x, y],
    width: 30,
  };
}

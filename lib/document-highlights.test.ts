import { describe, expect, it, vi } from "vitest";

import {
  addDocumentHighlightBounds,
  findDocumentHighlightBounds,
} from "@/lib/document-highlight-orchestration";
import { buildPageText } from "@/lib/document-highlight-tokens";
import type { GeneratedDocumentModel } from "@/lib/document-model";
import {
  createPdfTextRegion,
  type PdfTextRegion,
} from "@/lib/pdf-text-regions";

const { getDocument } = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument }));

describe("addDocumentHighlightBounds", () => {
  it("grounds every ordered source of a two-page chunk", async () => {
    mockPdfPages([
      [pdfTextItem("The passage begins on page one.", 10, 70)],
      [pdfTextItem("It concludes completely on page two.", 10, 70)],
    ]);
    const model = createModel([
      {
        page_index: 1,
        source_text: "The passage begins on page one.",
      },
      {
        page_index: 2,
        source_text: "It concludes completely on page two.",
      },
    ]);

    const result = await addDocumentHighlightBounds(
      Buffer.from("pdf"),
      model,
    );

    expect(result.pages[1].chunks[0].sources).toEqual([
      expect.objectContaining({ highlight_bounds: [expect.any(Object)] }),
      expect.objectContaining({ highlight_bounds: [expect.any(Object)] }),
    ]);
  });

  it("uses ordered source context to resolve a repeated passage", async () => {
    mockPdfPages([
      [
        pdfTextItem(
          "Repeated passage. Ordering context. Repeated passage.",
          10,
          70,
        ),
      ],
    ]);
    const model = createModel(
      [
        { page_index: 1, source_text: "Ordering context." },
        { page_index: 1, source_text: "Repeated passage." },
      ],
      1,
    );

    const result = await addDocumentHighlightBounds(
      Buffer.from("pdf"),
      model,
    );

    expect(result.pages[0].chunks[0].sources).toHaveLength(2);
  });

  it("tolerates a small number of unmatched source tokens", async () => {
    mockPdfPages([
      [pdfTextItem("Only the grounded words exist.", 10, 70)],
    ]);
    const model = createModel(
      [
        {
          page_index: 1,
          source_text: "Only invented words exist.",
        },
      ],
      1,
    );

    const result = await addDocumentHighlightBounds(
      Buffer.from("pdf"),
      model,
    );

    expect(
      result.pages[0].chunks[0].sources[0].highlight_bounds,
    ).toHaveLength(2);
  });

  it("rejects sources with too many unmatched tokens", async () => {
    mockPdfPages([
      [pdfTextItem("Only the grounded words exist.", 10, 70)],
    ]);
    const model = createModel(
      [
        {
          page_index: 1,
          source_text: "Only quite invented opening completely words exist.",
        },
      ],
      1,
    );

    await expect(
      addDocumentHighlightBounds(Buffer.from("pdf"), model),
    ).rejects.toThrow(
      'Chunk chunk:p1-grounding, source 1, PDF page 1: source token "quite" is missing from the PDF page.',
    );
  });

  it("applies the skip budget per source", async () => {
    mockPdfPages([
      [pdfTextItem("Only the grounded words exist here.", 10, 70)],
    ]);
    const model = createModel(
      [
        {
          page_index: 1,
          source_text: "Only invented words exist",
        },
        {
          page_index: 1,
          source_text: "Grounded opening words exist here.",
        },
      ],
      1,
    );

    const result = await addDocumentHighlightBounds(
      Buffer.from("pdf"),
      model,
    );
    const sources = result.pages[0].chunks[0].sources;

    expect(sources).toHaveLength(2);
    expect(sources[0].highlight_bounds.length).toBeGreaterThan(0);
    expect(sources[1].highlight_bounds.length).toBeGreaterThan(0);
  });

  it("crops a boundary text item along its rotated baseline", async () => {
    mockPdfPages([
      [
        {
          str: "prefix target suffix",
          transform: [0, 10, -5, 0, 20, 30],
          width: 20,
        },
      ],
    ]);
    const model = createModel(
      [{ page_index: 1, source_text: "target" }],
      1,
    );

    const result = await addDocumentHighlightBounds(
      Buffer.from("pdf"),
      model,
    );
    const bounds =
      result.pages[0].chunks[0].sources[0].highlight_bounds[0];

    expect(bounds.y).toBeGreaterThan(0.34);
    expect(bounds.height).toBeLessThan(0.1);
  });
});

describe("findDocumentHighlightBounds", () => {
  it("normalizes Unicode, ligatures, punctuation, and whitespace boundaries", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("English- ", 0.1, 0.2, 0.18),
        region("to-\uFB01t systems", 0.29, 0.2, 0.22),
      ],
      "English\uFFFEto–fit systems",
    );

    expect(bounds).not.toBeNull();
  });

  it("rejects source-only omissions instead of accepting a long edge", () => {
    expect(
      findDocumentHighlightBounds(
        [
          region(
            "A long visible suffix has enough characters for the old threshold.",
            0.1,
            0.2,
            0.7,
          ),
        ],
        "Invented opening text. A long visible suffix has enough characters for the old threshold.",
      ),
    ).toBeNull();
  });

  it("preserves word boundaries", () => {
    expect(
      findDocumentHighlightBounds(
        [region("foobar", 0.1, 0.2, 0.2)],
        "foo bar",
      ),
    ).toBeNull();
  });

  it("normalizes words hyphenated across PDF text items", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("inter-", 0.1, 0.2, 0.12),
        region("national evidence", 0.1, 0.24, 0.24),
      ],
      "international evidence",
    );

    expect(bounds).toHaveLength(2);
  });

  it("also preserves separate words around a PDF line-ending hyphen", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("English-", 0.1, 0.2, 0.12),
        region("to-German translation", 0.1, 0.24, 0.24),
      ],
      "English\uFFFEto-German translation",
    );

    expect(bounds).toHaveLength(2);
  });

  it("combines visually adjacent PDF items used for one source token", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("h", 0.1, 0.2, 0.02),
        region("t", 0.12, 0.202, 0.01),
        region(", then continue", 0.14, 0.2, 0.2),
      ],
      "ht, then continue",
    );

    expect(bounds).toHaveLength(1);
  });

  it("combines visually adjacent punctuation items", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("result", 0.1, 0.2, 0.06),
        region(")", 0.16, 0.2, 0.01),
        region(".", 0.17, 0.2, 0.01),
      ],
      "result).",
    );

    expect(bounds).toHaveLength(1);
  });

  it("emits discontinuous rectangles around PDF-only insertions", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("The result follows", 0.1, 0.2, 0.25),
        region("footnote material", 0.1, 0.24, 0.2),
        region("from the premise", 0.1, 0.28, 0.22),
      ],
      "The result follows from the premise",
    );

    expect(bounds).toHaveLength(2);
  });

  it("prefers the tightest complete alignment over a loose subsequence", () => {
    const bounds = findDocumentHighlightBounds(
      [
        region("The unrelated introduction uses common words.", 0.1, 0.2, 0.5),
        region("The exact source uses common words.", 0.1, 0.3, 0.4),
      ],
      "The exact source uses common words.",
    );

    expect(bounds).toHaveLength(1);
    expect(bounds![0].y).toBeGreaterThan(0.29);
  });

  it("crops the first and last matching text items", () => {
    const bounds = findDocumentHighlightBounds(
      [region("prefix target suffix", 0.1, 0.2, 0.6)],
      "target",
    );

    expect(bounds).toHaveLength(1);
    expect(bounds![0].x).toBeGreaterThan(0.25);
    expect(bounds![0].x + bounds![0].width).toBeLessThan(0.55);
  });

  it("rejects unresolved repeated text", () => {
    const repeatedText = "This passage repeats exactly.";
    const regions: PdfTextRegion[] = [
      region(repeatedText, 0.1, 0.2, 0.5),
      region(repeatedText, 0.1, 0.3, 0.5),
    ];

    expect(
      findDocumentHighlightBounds(regions, repeatedText),
    ).toBeNull();
  });
});

describe("buildPageText", () => {
  it("joins trimmed region text with single spaces", () => {
    expect(
      buildPageText([
        region("First  page ", 0.1, 0.2, 0.3),
        region("", 0.1, 0.3, 0.1),
        region("second page", 0.1, 0.4, 0.3),
      ]),
    ).toBe("First page second page");
  });
});

describe("createPdfTextRegion", () => {
  it("composes transforms and bounds rotated text", () => {
    const result = createPdfTextRegion({
      text: "Rotated",
      itemTransform: [0, 10, -5, 0, 20, 30],
      itemWidth: 2,
      viewportTransform: [1, 0, 0, 1, 0, 0],
      viewportWidth: 100,
      viewportHeight: 100,
      viewportScale: 1,
    });

    expect(result).toMatchObject({
      x: 0.15,
      y: 0.3,
      text: "Rotated",
    });
    expect(result!.width).toBeCloseTo(0.05);
    expect(result!.height).toBeCloseTo(0.02);
  });

  it("bounds skewed text and clamps it to the viewport", () => {
    const result = createPdfTextRegion({
      text: "Skewed",
      itemTransform: [10, 2, 3, -8, 98, 4],
      itemWidth: 4,
      viewportTransform: [1, 0, 0, 1, 0, 0],
      viewportWidth: 100,
      viewportHeight: 100,
      viewportScale: 1,
    });

    expect(result).toMatchObject({
      x: 0.98,
      y: 0,
      text: "Skewed",
    });
    expect(result!.x + result!.width).toBe(1);
    expect(result!.height).toBeGreaterThan(0);
  });

  it("composes the item and viewport transforms", () => {
    const result = createPdfTextRegion({
      text: "Composed",
      itemTransform: [1, 0, 0, 5, 20, 30],
      itemWidth: 10,
      viewportTransform: [2, 0, 0, -2, 10, 100],
      viewportWidth: 200,
      viewportHeight: 100,
      viewportScale: 2,
    });

    expect(result).toEqual({
      x: 0.25,
      y: 0.3,
      width: 0.09999999999999998,
      height: 0.10000000000000003,
      text: "Composed",
    });
  });

  it("returns null for blank or degenerate items", () => {
    const baseInput = {
      text: " ",
      itemTransform: [1, 0, 0, 1, 10, 10],
      itemWidth: 10,
      viewportTransform: [1, 0, 0, 1, 0, 0],
      viewportWidth: 100,
      viewportHeight: 100,
      viewportScale: 1,
    };

    expect(createPdfTextRegion(baseInput)).toBeNull();
    expect(
      createPdfTextRegion({ ...baseInput, text: "Text", itemWidth: 0 }),
    ).toBeNull();
  });
});

function createModel(
  sources: GeneratedDocumentModel["pages"][number]["chunks"][number]["sources"],
  pageCount = 2,
): GeneratedDocumentModel {
  const ownerPageIndex = pageCount;

  return {
    schema_version: 5,
    document_id: "document-1",
    title: "Document",
    page_count: pageCount,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      page_index: index + 1,
      page_label: String(index + 1),
      chunks:
        index + 1 === ownerPageIndex
          ? [
              {
                id: `chunk:p${ownerPageIndex}-grounding`,
                section_title: "Section",
                title: "Chunk",
                summary: "Summary",
                concept_ids: [],
                sources,
              },
            ]
          : [],
    })),
    concepts: [],
    connections: [],
  };
}

function mockPdfPages(itemsByPage: ReturnType<typeof pdfTextItem>[][]) {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: itemsByPage.length,
      getPage: vi.fn().mockImplementation(async (pageIndex: number) => ({
        getViewport: () => ({
          width: 100,
          height: 100,
          scale: 1,
          transform: [1, 0, 0, 1, 0, 0],
        }),
        getTextContent: () =>
          Promise.resolve({ items: itemsByPage[pageIndex - 1] }),
      })),
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
}

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
    width: 60,
  };
}

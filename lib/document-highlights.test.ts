import { describe, expect, it } from "vitest";

import {
  findDocumentHighlightBounds,
  type PdfTextRegion,
} from "@/lib/document-highlights";

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

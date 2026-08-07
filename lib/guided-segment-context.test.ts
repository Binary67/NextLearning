import { describe, expect, it } from "vitest";

import type {
  DocumentChunk,
  DocumentModel,
} from "@/lib/document-model";
import { getGuidedSegmentContext } from "@/lib/guided-segment-context";

describe("getGuidedSegmentContext", () => {
  it("returns two segments on either side across page boundaries", () => {
    const model = createModel([
      [createChunk("a"), createChunk("b")],
      [createChunk("c"), createChunk("d")],
      [],
      [createChunk("e")],
    ]);

    expect(getGuidedSegmentContext(model, 2, 0)).toEqual({
      previous_segments: [
        contextItem(1, "a"),
        contextItem(1, "b"),
      ],
      upcoming_segments: [
        contextItem(2, "d"),
        contextItem(4, "e"),
      ],
    });
  });

  it("returns only available segments at a document boundary", () => {
    const model = createModel([
      [createChunk("a"), createChunk("b")],
      [createChunk("c")],
    ]);

    expect(getGuidedSegmentContext(model, 1, 0)).toEqual({
      previous_segments: [],
      upcoming_segments: [
        contextItem(1, "b"),
        contextItem(2, "c"),
      ],
    });
  });
});

function createModel(pages: DocumentChunk[][]): DocumentModel {
  return {
    schema_version: 5,
    document_id: "document",
    title: "Document",
    page_count: pages.length,
    pages: pages.map((chunks, index) => ({
      page_index: index + 1,
      page_label: String(index + 1),
      chunks,
    })),
    concepts: [],
    connections: [],
  };
}

function createChunk(name: string): DocumentChunk {
  return {
    id: `chunk:${name}`,
    section_title: `Section ${name}`,
    sources: [
      {
        page_index: 1,
        source_text: `Source ${name}`,
        highlight_bounds: [],
      },
    ],
    title: `Title ${name}`,
    summary: `Summary ${name}`,
    concept_ids: [],
  };
}

function contextItem(pageIndex: number, name: string) {
  return {
    page_index: pageIndex,
    page_label: String(pageIndex),
    section_title: `Section ${name}`,
    title: `Title ${name}`,
    summary: `Summary ${name}`,
  };
}

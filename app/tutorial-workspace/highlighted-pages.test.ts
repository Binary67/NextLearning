import { describe, expect, it } from "vitest";

import type { DocumentChunk } from "@/lib/document-model";

import {
  formatHighlightedSourcePages,
  getAdjacentHighlightedPage,
  getHighlightedSourcePages,
} from "./highlighted-pages";

describe("highlighted source pages", () => {
  it("derives sorted unique source pages from a chunk", () => {
    expect(getHighlightedSourcePages(createChunk(3, 2, 3))).toEqual([2, 3]);
    expect(getHighlightedSourcePages(null)).toEqual([]);
  });

  it("finds the adjacent highlighted page in either direction", () => {
    const pages = [2, 3];

    expect(getAdjacentHighlightedPage(pages, 2, "previous")).toBeNull();
    expect(getAdjacentHighlightedPage(pages, 2, "next")).toBe(3);
    expect(getAdjacentHighlightedPage(pages, 3, "previous")).toBe(2);
    expect(getAdjacentHighlightedPage(pages, 3, "next")).toBeNull();
  });

  it("finds a highlighted page when the current page is outside the set", () => {
    const pages = [2, 4];

    expect(getAdjacentHighlightedPage(pages, 3, "previous")).toBe(2);
    expect(getAdjacentHighlightedPage(pages, 3, "next")).toBe(4);
  });

  it("formats single, consecutive, and separated source pages", () => {
    expect(formatHighlightedSourcePages([2])).toBe(
      "Highlighted source: page 2",
    );
    expect(formatHighlightedSourcePages([2, 3])).toBe(
      "Highlighted source: pages 2–3",
    );
    expect(formatHighlightedSourcePages([2, 4, 5])).toBe(
      "Highlighted source: pages 2, 4, 5",
    );
  });
});

function createChunk(...sourcePages: number[]): DocumentChunk {
  return {
    id: "chunk:test",
    section_title: "Test section",
    title: "Test chunk",
    summary: "Test summary",
    concept_ids: [],
    sources: sourcePages.map((pageIndex) => ({
      page_index: pageIndex,
      source_text: `Source on page ${pageIndex}`,
      highlight_bounds: [],
    })),
  };
}

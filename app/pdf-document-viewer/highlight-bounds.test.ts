import { describe, expect, it } from "vitest";

import type { SelectionBounds } from "@/lib/document-selection";

import {
  createHighlightBoundsSignature,
  findFirstVisualHighlight,
} from "./highlight-bounds";

describe("createHighlightBoundsSignature", () => {
  const bounds: SelectionBounds[] = [
    { x: 0.4, y: 0.2, width: 0.3, height: 0.04 },
    { x: 0.1, y: 0.2, width: 0.2, height: 0.04 },
  ];

  it("is stable across new array references and input ordering", () => {
    expect(createHighlightBoundsSignature(3, bounds)).toBe(
      createHighlightBoundsSignature(3, [...bounds].reverse()),
    );
  });

  it("changes with the page or numeric bound content", () => {
    const signature = createHighlightBoundsSignature(3, bounds);

    expect(createHighlightBoundsSignature(4, bounds)).not.toBe(signature);
    expect(
      createHighlightBoundsSignature(3, [
        bounds[0],
        { ...bounds[1], width: 0.21 },
      ]),
    ).not.toBe(signature);
  });
});

describe("findFirstVisualHighlight", () => {
  it("chooses the topmost and then leftmost rectangle", () => {
    const topRight = { x: 0.6, y: 0.1, width: 0.2, height: 0.04 };
    const topLeft = { x: 0.2, y: 0.1, width: 0.2, height: 0.04 };
    const lower = { x: 0.1, y: 0.3, width: 0.2, height: 0.04 };

    expect(findFirstVisualHighlight([lower, topRight, topLeft])).toBe(
      topLeft,
    );
  });

  it("returns null when there are no rectangles", () => {
    expect(findFirstVisualHighlight([])).toBeNull();
  });
});

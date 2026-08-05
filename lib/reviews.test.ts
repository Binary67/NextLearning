import { describe, expect, it } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import type {
  ConceptLearningState,
  LearningState,
} from "@/lib/learning-state";
import { buildDueReviewQueue } from "@/lib/reviews";

const tutorialId = "6cf395b6-b6b7-4492-9705-7168d3d25a0b";

describe("review queue", () => {
  it("returns only due concepts with grounded tutorial context", () => {
    const reviews = buildDueReviewQueue(
      [tutorial(concepts())],
      new Date("2026-08-05T10:00:00.000Z"),
    );

    expect(reviews).toHaveLength(4);
    expect(reviews[0]).toMatchObject({
      conceptId: "concept:delta",
      conceptName: "Delta",
      definition: "Definition for Delta.",
      chunkId: "chunk:delta",
      pageIndex: 4,
      pageLabel: "4",
      dueAt: "2026-08-05T08:00:00.000Z",
    });
    expect(reviews.some((item) => item.conceptId === "concept:future")).toBe(
      false,
    );
  });

  it("orders by urgency, weaker result, and prerequisite importance", () => {
    const reviews = buildDueReviewQueue(
      [tutorial(concepts())],
      new Date("2026-08-05T10:00:00.000Z"),
    );

    expect(reviews.map((item) => item.conceptId)).toEqual([
      "concept:delta",
      "concept:alpha",
      "concept:beta",
      "concept:gamma",
    ]);
  });
});

function tutorial(conceptStates: Record<string, ConceptLearningState>) {
  return {
    tutorialId,
    tutorialTitle: "Review tutorial",
    model,
    learningState: {
      tutorialId,
      updatedAt: "2026-08-05T09:00:00.000Z",
      resume: null,
      concepts: conceptStates,
      sessions: [],
    } satisfies LearningState,
  };
}

function concepts(): Record<string, ConceptLearningState> {
  return {
    "concept:gamma": conceptState(
      "concept:gamma",
      "partial",
      "2026-08-05T09:00:00.000Z",
    ),
    "concept:beta": conceptState(
      "concept:beta",
      "incorrect",
      "2026-08-05T09:00:00.000Z",
    ),
    "concept:alpha": conceptState(
      "concept:alpha",
      "incorrect",
      "2026-08-05T09:00:00.000Z",
    ),
    "concept:delta": conceptState(
      "concept:delta",
      "correct",
      "2026-08-05T08:00:00.000Z",
    ),
    "concept:future": conceptState(
      "concept:future",
      "incorrect",
      "2026-08-05T11:00:00.000Z",
    ),
  };
}

function conceptState(
  conceptId: string,
  lastResult: ConceptLearningState["lastResult"],
  nextReviewAt: string,
): ConceptLearningState {
  return {
    conceptId,
    status: "reviewing",
    lastChunkId: conceptId.replace("concept:", "chunk:"),
    lastAttemptAt: "2026-08-05T07:00:00.000Z",
    nextReviewAt,
    consecutiveCorrect: lastResult === "correct" ? 1 : 0,
    lastResult,
    lastConfidence: null,
    misconception: null,
  };
}

const conceptNames = ["Alpha", "Beta", "Gamma", "Delta", "Future"];

const model: DocumentModel = {
  schema_version: 4,
  document_id: tutorialId,
  title: "Review tutorial",
  page_count: conceptNames.length,
  pages: conceptNames.map((name, index) => ({
    page_index: index + 1,
    page_label: String(index + 1),
    chunks: [
      {
        id: `chunk:${name.toLowerCase()}`,
        section_title: name,
        source_text: `${name} source text.`,
        highlight_bounds: [
          { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
        ],
        title: name,
        summary: `${name} summary.`,
        concept_ids: [`concept:${name.toLowerCase()}`],
      },
    ],
  })),
  concepts: conceptNames.map((name, index) => ({
    id: `concept:${name.toLowerCase()}`,
    name,
    definition: `Definition for ${name}.`,
    occurrences: [
      {
        page_index: index + 1,
        page_label: String(index + 1),
        role: "defined",
        explicitness: "explicit",
        confidence: 1,
      },
    ],
  })),
  connections: [
    {
      from: "concept:alpha",
      to: "concept:gamma",
      relationship: "prerequisite_for",
      relevant_pages: [1, 3],
      reason: "Alpha supports Gamma.",
      confidence: 1,
    },
  ],
};

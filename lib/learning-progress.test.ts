import { describe, expect, it } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import { summarizeLearningProgress } from "@/lib/learning-progress";
import type {
  ConceptLearningState,
  LearningState,
} from "@/lib/learning-state";

const tutorialId = "6cf395b6-b6b7-4492-9705-7168d3d25a0b";
const now = new Date("2026-08-05T10:00:00.000Z");

describe("learning progress summary", () => {
  it("reports an untouched document as fully unpracticed", () => {
    const summary = summarizeLearningProgress(
      model,
      learningState({}),
      now,
    );

    expect(summary).toEqual({
      practiced: 0,
      total: 6,
      mastered: 0,
      reviewing: 0,
      learning: 0,
      notPracticed: 6,
      dueNow: 0,
    });
  });

  it("counts statuses and due reviews across mixed progress", () => {
    const summary = summarizeLearningProgress(
      model,
      learningState({
        "concept:alpha": conceptState("concept:alpha", {
          status: "mastered",
          nextReviewAt: "2026-08-05T08:00:00.000Z",
          consecutiveCorrect: 3,
        }),
        "concept:beta": conceptState("concept:beta", {
          status: "reviewing",
          nextReviewAt: "2026-08-06T10:00:00.000Z",
        }),
        "concept:gamma": conceptState("concept:gamma", {
          status: "learning",
          nextReviewAt: "2026-08-05T09:00:00.000Z",
        }),
        "concept:delta": conceptState("concept:delta", {
          status: "learning",
          nextReviewAt: null,
        }),
      }),
      now,
    );

    expect(summary).toEqual({
      practiced: 4,
      total: 6,
      mastered: 1,
      reviewing: 1,
      learning: 2,
      notPracticed: 2,
      dueNow: 2,
    });
  });

  it("reports no due reviews when every concept is mastered ahead of schedule", () => {
    const summary = summarizeLearningProgress(
      model,
      learningState(
        Object.fromEntries(
          model.concepts.map((concept) => [
            concept.id,
            conceptState(concept.id, {
              status: "mastered",
              nextReviewAt: "2026-08-19T10:00:00.000Z",
              consecutiveCorrect: 3,
            }),
          ]),
        ),
      ),
      now,
    );

    expect(summary).toEqual({
      practiced: 6,
      total: 6,
      mastered: 6,
      reviewing: 0,
      learning: 0,
      notPracticed: 0,
      dueNow: 0,
    });
  });

  it("treats a review scheduled exactly now as due", () => {
    const summary = summarizeLearningProgress(
      model,
      learningState({
        "concept:alpha": conceptState("concept:alpha", {
          status: "reviewing",
          nextReviewAt: now.toISOString(),
        }),
      }),
      now,
    );

    expect(summary.dueNow).toBe(1);
  });
});

function learningState(
  conceptStates: Record<string, ConceptLearningState>,
): LearningState {
  return {
    tutorialId,
    updatedAt: "2026-08-05T09:00:00.000Z",
    resume: null,
    concepts: conceptStates,
    sessions: [],
  };
}

function conceptState(
  conceptId: string,
  overrides: Partial<ConceptLearningState>,
): ConceptLearningState {
  return {
    conceptId,
    status: "reviewing",
    lastChunkId: conceptId.replace("concept:", "chunk:"),
    lastAttemptAt: "2026-08-05T07:00:00.000Z",
    nextReviewAt: "2026-08-05T08:00:00.000Z",
    consecutiveCorrect: 0,
    lastResult: "correct",
    lastConfidence: null,
    misconception: null,
    ...overrides,
  };
}

const conceptNames = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];

const model: DocumentModel = {
  schema_version: 4,
  document_id: tutorialId,
  title: "Progress tutorial",
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
  connections: [],
};

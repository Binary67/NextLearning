import { describe, expect, test } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import {
  findReviewCheckpoint,
  selectPrimaryCheckpoint,
  transitionLearningLoop,
} from "@/lib/learning-checkpoints";

const model: DocumentModel = {
  schema_version: 4,
  document_id: "tutorial:one",
  title: "Learning loops",
  page_count: 1,
  pages: [
    {
      page_index: 1,
      page_label: "1",
      chunks: [
        {
          id: "chunk:one",
          section_title: "Core ideas",
          source_text: "A source passage.",
          highlight_bounds: [
            { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
          ],
          title: "The active chunk",
          summary: "A summary.",
          concept_ids: [
            "concept:introduced",
            "concept:defined",
            "concept:applied",
          ],
        },
      ],
    },
  ],
  concepts: [
    {
      id: "concept:introduced",
      name: "Introduced concept",
      definition: "An introduction.",
      occurrences: [
        {
          page_index: 1,
          page_label: "1",
          role: "introduced",
          explicitness: "explicit",
          confidence: 1,
        },
      ],
    },
    {
      id: "concept:defined",
      name: "Defined concept",
      definition: "A definition.",
      occurrences: [
        {
          page_index: 1,
          page_label: "1",
          role: "defined",
          explicitness: "explicit",
          confidence: 1,
        },
      ],
    },
    {
      id: "concept:applied",
      name: "Applied concept",
      definition: "An application.",
      occurrences: [
        {
          page_index: 1,
          page_label: "1",
          role: "applied",
          explicitness: "explicit",
          confidence: 1,
        },
      ],
    },
  ],
  connections: [],
};

describe("checkpoint selection", () => {
  test("prioritizes defined concepts and uses document order to break ties", () => {
    const selection = selectPrimaryCheckpoint(
      model,
      1,
      model.pages[0].chunks[0],
      new Set(),
    );

    expect(selection?.concept.id).toBe("concept:defined");
    expect(selection?.role).toBe("defined");
  });

  test("skips concepts already checkpointed in the active session", () => {
    const selection = selectPrimaryCheckpoint(
      model,
      1,
      model.pages[0].chunks[0],
      new Set(["concept:defined"]),
    );

    expect(selection?.concept.id).toBe("concept:applied");
  });

  test("returns no checkpoint for reference-only occurrences", () => {
    const referenceOnlyModel: DocumentModel = {
      ...model,
      concepts: [
        {
          ...model.concepts[0],
          occurrences: [
            {
              ...model.concepts[0].occurrences[0],
              role: "referenced",
            },
          ],
        },
      ],
      pages: [
        {
          ...model.pages[0],
          chunks: [
            {
              ...model.pages[0].chunks[0],
              concept_ids: ["concept:introduced"],
            },
          ],
        },
      ],
    };

    expect(
      selectPrimaryCheckpoint(
        referenceOnlyModel,
        1,
        referenceOnlyModel.pages[0].chunks[0],
        new Set(),
      ),
    ).toBeNull();
  });

  test("finds a review only when the saved chunk contains the concept", () => {
    expect(
      findReviewCheckpoint(model, "concept:defined", "chunk:one")?.pageIndex,
    ).toBe(1);
    expect(
      findReviewCheckpoint(model, "concept:missing", "chunk:one"),
    ).toBeNull();
  });
});

describe("learning loop transitions", () => {
  test("uses diagnostic correctness only to tailor the explanation", () => {
    expect(
      transitionLearningLoop(
        { phase: "diagnostic", attemptNumber: 1 },
        "correct",
      ),
    ).toEqual({
      state: { phase: "checkpoint", attemptNumber: 1 },
      action: "bridge_then_checkpoint",
      resolved: false,
    });
    expect(
      transitionLearningLoop(
        { phase: "diagnostic", attemptNumber: 1 },
        "incorrect",
      ),
    ).toEqual({
      state: { phase: "checkpoint", attemptNumber: 1 },
      action: "full_explanation_then_checkpoint",
      resolved: false,
    });
  });

  test("allows one hint and one retry before resolving", () => {
    const retry = transitionLearningLoop(
      { phase: "checkpoint", attemptNumber: 1 },
      "partial",
    );

    expect(retry).toEqual({
      state: { phase: "checkpoint", attemptNumber: 2 },
      action: "hint_then_retry",
      resolved: false,
    });
    expect(
      transitionLearningLoop(retry.state!, "incorrect"),
    ).toEqual({
      state: null,
      action: "corrective_feedback_then_resolve",
      resolved: true,
    });
  });

  test("resolves a correct review without a retry", () => {
    expect(
      transitionLearningLoop(
        { phase: "review", attemptNumber: 1 },
        "correct",
      ),
    ).toEqual({
      state: null,
      action: "resolve_correct",
      resolved: true,
    });
  });
});

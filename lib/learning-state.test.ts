import { describe, expect, it } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import {
  createEmptyLearningState,
  LearningStateConflictError,
  LearningStateInputError,
  parseLearningAttemptInput,
  parseLearningSessionInput,
  parseResumeInput,
  recordLearningAttempt,
  recordLearningSession,
  updateResume,
  validateAttemptReferences,
  validateLearningState,
  validateResumeReferences,
  validateSessionReferences,
  type LearningAttemptInput,
} from "@/lib/learning-state";

const tutorialId = "6cf395b6-b6b7-4492-9705-7168d3d25a0b";
const sessionId = "2b3cb980-d250-476f-a702-90e9e62b70d7";
const start = new Date("2026-08-05T09:00:00.000Z");

describe("learning-state scheduling", () => {
  it("records diagnostic failures without scheduling a review", () => {
    const state = recordLearningAttempt(
      createEmptyLearningState(tutorialId, start),
      attempt({ phase: "diagnostic", result: "incorrect" }),
      start,
    );

    expect(state.concepts["concept:alpha"]).toMatchObject({
      status: "learning",
      consecutiveCorrect: 0,
      lastResult: "incorrect",
      lastConfidence: null,
      nextReviewAt: null,
    });
  });

  it("schedules incorrect answers before partial answers", () => {
    const empty = createEmptyLearningState(tutorialId, start);
    const incorrect = recordLearningAttempt(
      empty,
      attempt({ result: "incorrect" }),
      start,
    );
    const partial = recordLearningAttempt(
      empty,
      attempt({ result: "partial" }),
      start,
    );

    expect(
      incorrect.concepts["concept:alpha"].nextReviewAt,
    ).toBe("2026-08-05T10:00:00.000Z");
    expect(incorrect.concepts["concept:alpha"].status).toBe("learning");
    expect(partial.concepts["concept:alpha"].nextReviewAt).toBe(
      "2026-08-05T15:00:00.000Z",
    );
  });

  it("extends correct intervals and requires repeated retrieval for mastery", () => {
    let state = createEmptyLearningState(tutorialId, start);

    state = recordLearningAttempt(
      state,
      attempt({ result: "correct" }),
      start,
    );
    expect(state.concepts["concept:alpha"]).toMatchObject({
      status: "reviewing",
      consecutiveCorrect: 1,
      nextReviewAt: "2026-08-06T09:00:00.000Z",
    });

    state = recordLearningAttempt(
      state,
      attempt({ result: "correct" }),
      new Date("2026-08-06T09:00:00.000Z"),
    );
    expect(state.concepts["concept:alpha"]).toMatchObject({
      status: "reviewing",
      consecutiveCorrect: 2,
      nextReviewAt: "2026-08-09T09:00:00.000Z",
    });

    state = recordLearningAttempt(
      state,
      attempt({ result: "correct" }),
      new Date("2026-08-09T09:00:00.000Z"),
    );
    expect(state.concepts["concept:alpha"]).toMatchObject({
      status: "mastered",
      consecutiveCorrect: 3,
      nextReviewAt: "2026-08-16T09:00:00.000Z",
    });
  });
});

describe("learning-state updates", () => {
  it("stores resume positions and compact session summaries", () => {
    const session = parseLearningSessionInput({
      id: sessionId,
      mode: "guided",
      startedAt: "2026-08-05T09:00:00.000Z",
      endedAt: "2026-08-05T09:20:00.000Z",
      conceptsPracticed: ["concept:alpha"],
    });
    let state = updateResume(
      createEmptyLearningState(tutorialId, start),
      { pageIndex: 1, chunkId: "chunk:alpha" },
      start,
    );

    state = recordLearningSession(state, session, start);

    expect(state.resume).toEqual({
      pageIndex: 1,
      chunkId: "chunk:alpha",
    });
    expect(state.sessions).toEqual([session]);
  });

  it("rejects attempts recorded after their session summary", () => {
    const ended = recordLearningSession(
      createEmptyLearningState(tutorialId, start),
      {
        id: sessionId,
        mode: "guided",
        startedAt: "2026-08-05T09:00:00.000Z",
        endedAt: "2026-08-05T09:20:00.000Z",
        conceptsPracticed: ["concept:alpha"],
      },
      start,
    );

    expect(() =>
      recordLearningAttempt(ended, attempt(), start),
    ).toThrow(LearningStateConflictError);
  });
});

describe("learning-state validation", () => {
  it("accepts current-format state and rejects unavailable stored IDs", () => {
    const state = recordLearningAttempt(
      createEmptyLearningState(tutorialId, start),
      attempt(),
      start,
    );

    expect(validateLearningState(state, tutorialId, model)).toEqual(
      state,
    );
    expect(() =>
      validateLearningState(
        {
          ...state,
          concepts: {
            "concept:alpha": {
              ...state.concepts["concept:alpha"],
              lastChunkId: "chunk:missing",
            },
          },
        },
        tutorialId,
        model,
      ),
    ).toThrow("invalid concept evidence");
  });

  it("rejects malformed bodies and references outside the model", () => {
    expect(() =>
      parseLearningAttemptInput({
        ...attempt(),
        transcript: "raw transcript",
      }),
    ).toThrow(LearningStateInputError);

    expect(() =>
      validateAttemptReferences(
        attempt({ conceptIds: ["concept:missing"] }),
        model,
      ),
    ).toThrow(LearningStateInputError);

    const mismatchedResume = parseResumeInput({
      resume: { pageIndex: 2, chunkId: "chunk:alpha" },
    });
    expect(() =>
      validateResumeReferences(mismatchedResume, model),
    ).toThrow(LearningStateInputError);

    expect(() =>
      validateSessionReferences(
        {
          id: sessionId,
          mode: "guided",
          startedAt: "2026-08-05T09:00:00.000Z",
          endedAt: "2026-08-05T09:20:00.000Z",
          conceptsPracticed: ["concept:missing"],
        },
        model,
      ),
    ).toThrow(LearningStateInputError);
  });
});

function attempt(
  overrides: Partial<LearningAttemptInput> = {},
): LearningAttemptInput {
  return {
    sessionId,
    phase: "checkpoint",
    chunkId: "chunk:alpha",
    conceptIds: ["concept:alpha"],
    result: "correct",
    confidence: null,
    misconception: null,
    ...overrides,
  };
}

const model: DocumentModel = {
  schema_version: 4,
  document_id: tutorialId,
  title: "Test tutorial",
  page_count: 2,
  pages: [
    {
      page_index: 1,
      page_label: "1",
      chunks: [
        {
          id: "chunk:alpha",
          section_title: "Alpha",
          source_text: "Alpha text",
          highlight_bounds: [
            { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
          ],
          title: "Alpha",
          summary: "Alpha summary",
          concept_ids: ["concept:alpha"],
        },
      ],
    },
    {
      page_index: 2,
      page_label: "2",
      chunks: [
        {
          id: "chunk:beta",
          section_title: "Beta",
          source_text: "Beta text",
          highlight_bounds: [
            { x: 0.1, y: 0.2, width: 0.2, height: 0.05 },
          ],
          title: "Beta",
          summary: "Beta summary",
          concept_ids: ["concept:beta"],
        },
      ],
    },
  ],
  concepts: [
    {
      id: "concept:alpha",
      name: "Alpha",
      definition: "The alpha concept.",
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
      id: "concept:beta",
      name: "Beta",
      definition: "The beta concept.",
      occurrences: [
        {
          page_index: 2,
          page_label: "2",
          role: "defined",
          explicitness: "explicit",
          confidence: 1,
        },
      ],
    },
  ],
  connections: [],
};

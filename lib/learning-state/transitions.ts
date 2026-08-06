import {
  CORRECT_REVIEW_INTERVALS_MS,
  FAILURE_REVIEW_INTERVALS_MS,
  MASTERY_CORRECT_COUNT,
} from "@/lib/learning-state/constants";
import {
  type ConceptLearningState,
  type LearningAttemptInput,
  type LearningAttemptResult,
  type LearningSessionInput,
  type LearningState,
  LearningStateConflictError,
  type LearningStatus,
} from "@/lib/learning-state/types";

export function createEmptyLearningState(
  tutorialId: string,
  now = new Date(),
): LearningState {
  return {
    tutorialId,
    updatedAt: now.toISOString(),
    resume: null,
    concepts: {},
    sessions: [],
  };
}

export function updateResume(
  state: LearningState,
  resume: LearningState["resume"],
  now = new Date(),
): LearningState {
  return {
    ...state,
    updatedAt: now.toISOString(),
    resume,
  };
}

export function recordLearningAttempt(
  state: LearningState,
  input: LearningAttemptInput,
  now = new Date(),
): LearningState {
  if (state.sessions.some((session) => session.id === input.sessionId)) {
    throw new LearningStateConflictError(
      "The learning session has already ended.",
    );
  }

  const attemptedAt = now.toISOString();
  const concepts = { ...state.concepts };

  for (const conceptId of input.conceptIds) {
    concepts[conceptId] = updateConceptLearningState(
      concepts[conceptId],
      conceptId,
      input,
      attemptedAt,
      now,
    );
  }

  return {
    ...state,
    updatedAt: attemptedAt,
    concepts,
  };
}

export function recordLearningSession(
  state: LearningState,
  input: LearningSessionInput,
  now = new Date(),
): LearningState {
  if (state.sessions.some((session) => session.id === input.id)) {
    return state;
  }

  return {
    ...state,
    updatedAt: now.toISOString(),
    sessions: [
      ...state.sessions,
      {
        ...input,
        conceptsPracticed: [...input.conceptsPracticed],
      },
    ],
  };
}

function updateConceptLearningState(
  current: ConceptLearningState | undefined,
  conceptId: string,
  input: LearningAttemptInput,
  attemptedAt: string,
  now: Date,
): ConceptLearningState {
  if (input.phase === "diagnostic") {
    const preservesRetrievalProgress =
      input.result === "correct" && current !== undefined;

    return {
      conceptId,
      status: preservesRetrievalProgress
        ? current.status
        : "learning",
      lastChunkId: input.chunkId,
      lastAttemptAt: attemptedAt,
      nextReviewAt: preservesRetrievalProgress
        ? current.nextReviewAt
        : null,
      consecutiveCorrect: preservesRetrievalProgress
        ? current.consecutiveCorrect
        : 0,
      lastResult: input.result,
      lastConfidence: input.confidence,
      misconception: input.misconception,
    };
  }

  const consecutiveCorrect =
    input.result === "correct"
      ? (current?.consecutiveCorrect ?? 0) + 1
      : 0;
  let status: LearningStatus = "reviewing";

  if (input.result === "incorrect") {
    status = "learning";
  } else if (consecutiveCorrect >= MASTERY_CORRECT_COUNT) {
    status = "mastered";
  }

  return {
    conceptId,
    status,
    lastChunkId: input.chunkId,
    lastAttemptAt: attemptedAt,
    nextReviewAt: scheduleNextReview(
      input.result,
      consecutiveCorrect,
      now,
    ),
    consecutiveCorrect,
    lastResult: input.result,
    lastConfidence: input.confidence,
    misconception: input.misconception,
  };
}

function scheduleNextReview(
  result: LearningAttemptResult,
  consecutiveCorrect: number,
  now: Date,
) {
  let intervalMs: number;

  if (result === "correct") {
    const intervalIndex = Math.min(
      Math.max(consecutiveCorrect - 1, 0),
      CORRECT_REVIEW_INTERVALS_MS.length - 1,
    );
    intervalMs = CORRECT_REVIEW_INTERVALS_MS[intervalIndex];
  } else {
    intervalMs = FAILURE_REVIEW_INTERVALS_MS[result];
  }

  return new Date(now.getTime() + intervalMs).toISOString();
}

import type { DocumentModel } from "@/lib/document-model";

export type LearningAttemptPhase =
  | "diagnostic"
  | "checkpoint"
  | "review";
export type LearningAttemptResult =
  | "correct"
  | "partial"
  | "incorrect";
export type LearningStatus = "learning" | "reviewing" | "mastered";

export type ConceptLearningState = {
  conceptId: string;
  status: LearningStatus;
  lastChunkId: string;
  lastAttemptAt: string;
  nextReviewAt: string | null;
  consecutiveCorrect: number;
  lastResult: LearningAttemptResult;
  lastConfidence: 1 | 2 | 3 | null;
  misconception: string | null;
};

export type LearningSession = {
  id: string;
  mode: "read" | "guided" | "review";
  startedAt: string;
  endedAt: string;
  conceptsPracticed: string[];
};

export type LearningState = {
  tutorialId: string;
  updatedAt: string;
  resume: { pageIndex: number; chunkId: string | null } | null;
  concepts: Record<string, ConceptLearningState>;
  sessions: LearningSession[];
};

export type LearningAttemptInput = {
  sessionId: string;
  phase: LearningAttemptPhase;
  chunkId: string;
  conceptIds: string[];
  result: LearningAttemptResult;
  confidence: 1 | 2 | 3 | null;
  misconception: string | null;
};

export type LearningSessionInput = LearningSession;

const attemptPhases = [
  "diagnostic",
  "checkpoint",
  "review",
] as const;
const attemptResults = ["correct", "partial", "incorrect"] as const;
const learningStatuses = ["learning", "reviewing", "mastered"] as const;
const sessionModes = ["read", "guided", "review"] as const;

const HOUR_MS = 60 * 60 * 1000;
const FAILURE_REVIEW_INTERVALS_MS = {
  incorrect: HOUR_MS,
  partial: 6 * HOUR_MS,
} as const;
const CORRECT_REVIEW_INTERVALS_MS = [
  24 * HOUR_MS,
  3 * 24 * HOUR_MS,
  7 * 24 * HOUR_MS,
  14 * 24 * HOUR_MS,
] as const;
const MASTERY_CORRECT_COUNT = 3;
const MAX_MISCONCEPTION_LENGTH = 500;

export class LearningStateInputError extends Error {}
export class LearningStateConflictError extends Error {}

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

export function parseResumeInput(
  value: unknown,
): LearningState["resume"] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["resume"])
  ) {
    throw new LearningStateInputError(
      "A valid resume position is required.",
    );
  }

  if (value.resume === null) {
    return null;
  }

  if (
    !isRecord(value.resume) ||
    !hasExactKeys(value.resume, ["pageIndex", "chunkId"]) ||
    !isPositiveInteger(value.resume.pageIndex) ||
    (value.resume.chunkId !== null &&
      typeof value.resume.chunkId !== "string")
  ) {
    throw new LearningStateInputError(
      "A valid resume position is required.",
    );
  }

  return {
    pageIndex: value.resume.pageIndex,
    chunkId: value.resume.chunkId,
  };
}

export function parseLearningAttemptInput(
  value: unknown,
): LearningAttemptInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "sessionId",
      "phase",
      "chunkId",
      "conceptIds",
      "result",
      "confidence",
      "misconception",
    ]) ||
    !isUuid(value.sessionId) ||
    !attemptPhases.includes(value.phase as LearningAttemptPhase) ||
    typeof value.chunkId !== "string" ||
    !isUniqueStringArray(value.conceptIds, 1, 120) ||
    !attemptResults.includes(value.result as LearningAttemptResult) ||
    !isLearningConfidence(value.confidence)
  ) {
    throw new LearningStateInputError(
      "A valid learning attempt is required.",
    );
  }

  let misconception: string | null = null;

  if (value.misconception !== null) {
    if (typeof value.misconception !== "string") {
      throw new LearningStateInputError(
        "A valid learning attempt is required.",
      );
    }

    misconception = value.misconception.trim();

    if (
      misconception.length === 0 ||
      misconception.length > MAX_MISCONCEPTION_LENGTH
    ) {
      throw new LearningStateInputError(
        "A valid learning attempt is required.",
      );
    }
  }

  return {
    sessionId: value.sessionId,
    phase: value.phase as LearningAttemptPhase,
    chunkId: value.chunkId,
    conceptIds: value.conceptIds,
    result: value.result as LearningAttemptResult,
    confidence: value.confidence,
    misconception,
  };
}

export function parseLearningSessionInput(
  value: unknown,
): LearningSessionInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "mode",
      "startedAt",
      "endedAt",
      "conceptsPracticed",
    ]) ||
    !isUuid(value.id) ||
    !sessionModes.includes(value.mode as LearningSession["mode"]) ||
    !isIsoTimestamp(value.startedAt) ||
    !isIsoTimestamp(value.endedAt) ||
    Date.parse(value.endedAt) < Date.parse(value.startedAt) ||
    !isUniqueStringArray(value.conceptsPracticed, 0, 120)
  ) {
    throw new LearningStateInputError(
      "A valid learning session is required.",
    );
  }

  return {
    id: value.id,
    mode: value.mode as LearningSession["mode"],
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    conceptsPracticed: value.conceptsPracticed,
  };
}

export function validateResumeReferences(
  resume: LearningState["resume"],
  model: DocumentModel,
) {
  if (resume === null) {
    return;
  }

  const page = model.pages.find(
    (item) => item.page_index === resume.pageIndex,
  );

  if (
    !page ||
    (resume.chunkId !== null &&
      !page.chunks.some((chunk) => chunk.id === resume.chunkId))
  ) {
    throw new LearningStateInputError(
      "The resume position is not available in this document.",
    );
  }
}

export function validateAttemptReferences(
  input: LearningAttemptInput,
  model: DocumentModel,
) {
  const chunkIds = new Set(
    model.pages.flatMap((page) =>
      page.chunks.map((chunk) => chunk.id),
    ),
  );
  const conceptIds = new Set(
    model.concepts.map((concept) => concept.id),
  );

  if (
    !chunkIds.has(input.chunkId) ||
    input.conceptIds.some((conceptId) => !conceptIds.has(conceptId))
  ) {
    throw new LearningStateInputError(
      "The learning attempt references unavailable document content.",
    );
  }
}

export function validateSessionReferences(
  input: LearningSessionInput,
  model: DocumentModel,
) {
  const conceptIds = new Set(
    model.concepts.map((concept) => concept.id),
  );

  if (
    input.conceptsPracticed.some(
      (conceptId) => !conceptIds.has(conceptId),
    )
  ) {
    throw new LearningStateInputError(
      "The learning session references unavailable concepts.",
    );
  }
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

export function validateLearningState(
  value: unknown,
  tutorialId: string,
  model: DocumentModel,
): LearningState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "tutorialId",
      "updatedAt",
      "resume",
      "concepts",
      "sessions",
    ]) ||
    value.tutorialId !== tutorialId ||
    !isIsoTimestamp(value.updatedAt) ||
    !isRecord(value.concepts) ||
    !Array.isArray(value.sessions)
  ) {
    throw new Error("The stored learning state is invalid.");
  }

  validateStoredResume(value.resume, model);
  validateStoredConcepts(value.concepts, model);
  validateStoredSessions(value.sessions, model);

  return value as LearningState;
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

function validateStoredResume(
  value: unknown,
  model: DocumentModel,
) {
  if (value === null) {
    return;
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["pageIndex", "chunkId"]) ||
    !isPositiveInteger(value.pageIndex) ||
    (value.chunkId !== null && typeof value.chunkId !== "string")
  ) {
    throw new Error("The stored learning state has an invalid resume.");
  }

  try {
    validateResumeReferences(
      {
        pageIndex: value.pageIndex,
        chunkId: value.chunkId,
      },
      model,
    );
  } catch {
    throw new Error("The stored learning state has an invalid resume.");
  }
}

function validateStoredConcepts(
  concepts: Record<string, unknown>,
  model: DocumentModel,
) {
  const modelConceptIds = new Set(
    model.concepts.map((concept) => concept.id),
  );
  const modelChunkIds = new Set(
    model.pages.flatMap((page) =>
      page.chunks.map((chunk) => chunk.id),
    ),
  );

  for (const [conceptId, value] of Object.entries(concepts)) {
    if (
      !modelConceptIds.has(conceptId) ||
      !isRecord(value) ||
      !hasExactKeys(value, [
        "conceptId",
        "status",
        "lastChunkId",
        "lastAttemptAt",
        "nextReviewAt",
        "consecutiveCorrect",
        "lastResult",
        "lastConfidence",
        "misconception",
      ]) ||
      value.conceptId !== conceptId ||
      !learningStatuses.includes(value.status as LearningStatus) ||
      typeof value.lastChunkId !== "string" ||
      !modelChunkIds.has(value.lastChunkId) ||
      !isIsoTimestamp(value.lastAttemptAt) ||
      (value.nextReviewAt !== null &&
        !isIsoTimestamp(value.nextReviewAt)) ||
      !isNonNegativeInteger(value.consecutiveCorrect) ||
      !attemptResults.includes(
        value.lastResult as LearningAttemptResult,
      ) ||
      !isLearningConfidence(value.lastConfidence) ||
      (value.misconception !== null &&
        (typeof value.misconception !== "string" ||
          value.misconception.length === 0 ||
          value.misconception.length > MAX_MISCONCEPTION_LENGTH)) ||
      (value.status !== "learning" &&
        value.nextReviewAt === null) ||
      (value.status === "mastered" &&
        value.consecutiveCorrect < MASTERY_CORRECT_COUNT)
    ) {
      throw new Error(
        "The stored learning state has invalid concept evidence.",
      );
    }
  }
}

function validateStoredSessions(
  sessions: unknown[],
  model: DocumentModel,
) {
  const sessionIds = new Set<string>();

  for (const value of sessions) {
    let session: LearningSessionInput;

    try {
      session = parseLearningSessionInput(value);
      validateSessionReferences(session, model);
    } catch {
      throw new Error(
        "The stored learning state has an invalid session.",
      );
    }

    if (sessionIds.has(session.id)) {
      throw new Error(
        "The stored learning state has a duplicate session.",
      );
    }

    sessionIds.add(session.id);
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: string[],
) {
  const actualKeys = Object.keys(value);

  return (
    actualKeys.length === keys.length &&
    keys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0
  );
}

function isUniqueStringArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    value.every(
      (item) => typeof item === "string" && item.length > 0,
    ) &&
    new Set(value).size === value.length
  );
}

function isLearningConfidence(
  value: unknown,
): value is 1 | 2 | 3 | null {
  return value === null || value === 1 || value === 2 || value === 3;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.includes("T") &&
    !Number.isNaN(Date.parse(value))
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

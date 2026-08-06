import type { DocumentModel } from "@/lib/document-model";
import {
  ATTEMPT_RESULTS,
  LEARNING_STATUSES,
  MASTERY_CORRECT_COUNT,
  MAX_MISCONCEPTION_LENGTH,
} from "@/lib/learning-state/constants";
import {
  hasExactKeys,
  isIsoTimestamp,
  isLearningConfidence,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
} from "@/lib/learning-state/guards";
import { parseLearningSessionInput } from "@/lib/learning-state/input";
import {
  validateResumeReferences,
  validateSessionReferences,
} from "@/lib/learning-state/references";
import {
  type LearningAttemptResult,
  type LearningSessionInput,
  type LearningState,
  type LearningStatus,
} from "@/lib/learning-state/types";

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
      !isValidStoredConcept(
        conceptId,
        value,
        modelConceptIds,
        modelChunkIds,
      )
    ) {
      throw new Error(
        "The stored learning state has invalid concept evidence.",
      );
    }
  }
}

function isValidStoredConcept(
  conceptId: string,
  value: unknown,
  modelConceptIds: Set<string>,
  modelChunkIds: Set<string>,
) {
  return (
    modelConceptIds.has(conceptId) &&
    isRecord(value) &&
    hasExactKeys(value, [
      "conceptId",
      "status",
      "lastChunkId",
      "lastAttemptAt",
      "nextReviewAt",
      "consecutiveCorrect",
      "lastResult",
      "lastConfidence",
      "misconception",
    ]) &&
    value.conceptId === conceptId &&
    LEARNING_STATUSES.includes(value.status as LearningStatus) &&
    typeof value.lastChunkId === "string" &&
    modelChunkIds.has(value.lastChunkId) &&
    isIsoTimestamp(value.lastAttemptAt) &&
    (value.nextReviewAt === null ||
      isIsoTimestamp(value.nextReviewAt)) &&
    isNonNegativeInteger(value.consecutiveCorrect) &&
    ATTEMPT_RESULTS.includes(
      value.lastResult as LearningAttemptResult,
    ) &&
    isLearningConfidence(value.lastConfidence) &&
    (value.misconception === null ||
      (typeof value.misconception === "string" &&
        value.misconception.length > 0 &&
        value.misconception.length <= MAX_MISCONCEPTION_LENGTH)) &&
    (value.status === "learning" ||
      value.nextReviewAt !== null) &&
    (value.status !== "mastered" ||
      value.consecutiveCorrect >= MASTERY_CORRECT_COUNT)
  );
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

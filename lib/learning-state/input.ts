import {
  ATTEMPT_PHASES,
  ATTEMPT_RESULTS,
  MAX_MISCONCEPTION_LENGTH,
  SESSION_MODES,
} from "@/lib/learning-state/constants";
import {
  hasExactKeys,
  isIsoTimestamp,
  isLearningConfidence,
  isPositiveInteger,
  isRecord,
  isUniqueStringArray,
  isUuid,
} from "@/lib/learning-state/guards";
import {
  type LearningAttemptInput,
  type LearningAttemptPhase,
  type LearningAttemptResult,
  type LearningSession,
  type LearningSessionInput,
  type LearningState,
  LearningStateInputError,
} from "@/lib/learning-state/types";

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
    !ATTEMPT_PHASES.includes(value.phase as LearningAttemptPhase) ||
    typeof value.chunkId !== "string" ||
    !isUniqueStringArray(value.conceptIds, 1, 120) ||
    !ATTEMPT_RESULTS.includes(value.result as LearningAttemptResult) ||
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
    !SESSION_MODES.includes(value.mode as LearningSession["mode"]) ||
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

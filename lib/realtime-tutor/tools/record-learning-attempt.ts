import type {
  LearningAttemptPhase,
  LearningAttemptResult,
} from "@/lib/learning-checkpoints";

export const RECORD_LEARNING_ATTEMPT_TOOL_NAME =
  "record_learning_attempt";

export type ActiveLearningAttempt = {
  phase: LearningAttemptPhase;
  attemptNumber: 1 | 2;
  chunkId: string;
  conceptId: string;
};

export type ValidatedLearningAttempt = ActiveLearningAttempt & {
  result: LearningAttemptResult;
  misconception: string | null;
};

export const recordLearningAttemptTool = {
  type: "function",
  name: RECORD_LEARNING_ATTEMPT_TOOL_NAME,
  description:
    "Record exactly one evaluation of the learner's answer during the active diagnostic, checkpoint, or review. Call this before giving feedback.",
  parameters: {
    type: "object",
    properties: {
      phase: {
        type: "string",
        enum: ["diagnostic", "checkpoint", "review"],
      },
      attempt_number: {
        type: "integer",
        enum: [1, 2],
      },
      chunk_id: {
        type: "string",
      },
      concept_ids: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 1,
      },
      result: {
        type: "string",
        enum: ["correct", "partial", "incorrect"],
      },
      misconception: {
        type: ["string", "null"],
        minLength: 1,
        maxLength: 240,
      },
    },
    required: [
      "phase",
      "attempt_number",
      "chunk_id",
      "concept_ids",
      "result",
      "misconception",
    ],
    additionalProperties: false,
  },
} as const;

export function readLearningAttempt(
  argumentsJson: string,
  activeAttempt: ActiveLearningAttempt,
): ValidatedLearningAttempt {
  let value: unknown;

  try {
    value = JSON.parse(argumentsJson) as unknown;
  } catch {
    throw new Error("The learning attempt arguments must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw new Error("The learning attempt arguments are invalid.");
  }

  const keys = Object.keys(value);
  const expectedKeys = [
    "attempt_number",
    "chunk_id",
    "concept_ids",
    "misconception",
    "phase",
    "result",
  ];

  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !keys.includes(key))
  ) {
    throw new Error("The learning attempt arguments are invalid.");
  }

  const phase = value.phase;
  const attemptNumber = value.attempt_number;
  const chunkId = value.chunk_id;
  const conceptIds = value.concept_ids;
  const result = value.result;
  const misconception = value.misconception;

  if (
    !isLearningAttemptPhase(phase) ||
    (attemptNumber !== 1 && attemptNumber !== 2) ||
    typeof chunkId !== "string" ||
    !Array.isArray(conceptIds) ||
    conceptIds.length !== 1 ||
    typeof conceptIds[0] !== "string" ||
    !isLearningAttemptResult(result) ||
    !(
      misconception === null ||
      (typeof misconception === "string" &&
        misconception.trim().length > 0 &&
        misconception.trim().length <= 240)
    )
  ) {
    throw new Error("The learning attempt arguments are invalid.");
  }

  if (
    phase !== activeAttempt.phase ||
    attemptNumber !== activeAttempt.attemptNumber ||
    chunkId !== activeAttempt.chunkId ||
    conceptIds[0] !== activeAttempt.conceptId
  ) {
    throw new Error(
      "The learning attempt does not match the active checkpoint.",
    );
  }

  return {
    ...activeAttempt,
    result,
    misconception:
      typeof misconception === "string" ? misconception.trim() : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLearningAttemptPhase(
  value: unknown,
): value is LearningAttemptPhase {
  return (
    value === "diagnostic" ||
    value === "checkpoint" ||
    value === "review"
  );
}

function isLearningAttemptResult(
  value: unknown,
): value is LearningAttemptResult {
  return (
    value === "correct" ||
    value === "partial" ||
    value === "incorrect"
  );
}

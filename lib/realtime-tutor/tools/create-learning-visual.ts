export const CREATE_LEARNING_VISUAL_TOOL_NAME =
  "create_learning_visual";

export type CreateLearningVisualArguments = {
  learnerQuestion: string;
  confusionSummary: string;
  learningGoal: string;
};

export const createLearningVisualTool = {
  type: "function",
  name: CREATE_LEARNING_VISUAL_TOOL_NAME,
  description:
    "Create one grounded learning visual when a spatial, dynamic, quantitative, process, comparison, or relationship depiction would materially improve the learner's understanding.",
  parameters: {
    type: "object",
    properties: {
      learner_question: {
        type: "string",
        description: "The learner's exact question.",
      },
      confusion_summary: {
        type: "string",
        description: "A concise diagnosis of what the learner finds confusing.",
      },
      learning_goal: {
        type: "string",
        description: "The specific understanding the visual should help the learner reach.",
      },
    },
    required: [
      "learner_question",
      "confusion_summary",
      "learning_goal",
    ],
    additionalProperties: false,
  },
} as const;

export function readCreateLearningVisualArguments(
  argumentsJson: string,
): CreateLearningVisualArguments {
  let value: unknown;

  try {
    value = JSON.parse(argumentsJson) as unknown;
  } catch {
    throw new Error("The learning visual arguments must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw new Error("The learning visual arguments are invalid.");
  }

  const expectedKeys = [
    "confusion_summary",
    "learner_question",
    "learning_goal",
  ];
  const keys = Object.keys(value);

  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !keys.includes(key)) ||
    !isNonEmptyString(value.learner_question) ||
    !isNonEmptyString(value.confusion_summary) ||
    !isNonEmptyString(value.learning_goal)
  ) {
    throw new Error("The learning visual arguments are invalid.");
  }

  return {
    learnerQuestion: value.learner_question,
    confusionSummary: value.confusion_summary,
    learningGoal: value.learning_goal,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

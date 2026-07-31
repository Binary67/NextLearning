import type { DocumentLayout } from "@/lib/document-layout";
import type { TeachingPlan } from "@/lib/teaching-plan";

export const TEACHING_GROUNDING_SCHEMA_VERSION = 2;

export type TeachingVisualFocus = {
  id: string;
  lesson_step_id: string;
  teaching_point: string;
  page_index: number;
  block_ids: string[];
};

export type TeachingUnitGrounding = {
  unit_id: string;
  focuses: TeachingVisualFocus[];
};

export type TeachingGrounding = {
  schema_version: number;
  document_id: string;
  units: TeachingUnitGrounding[];
};

export const teachingGroundingJsonSchema = {
  type: "object",
  properties: {
    schema_version: {
      type: "integer",
      enum: [TEACHING_GROUNDING_SCHEMA_VERSION],
    },
    document_id: { type: "string" },
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          unit_id: { type: "string" },
          focuses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                },
                lesson_step_id: { type: "string" },
                teaching_point: { type: "string" },
                page_index: { type: "integer" },
                block_ids: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: [
                "id",
                "lesson_step_id",
                "teaching_point",
                "page_index",
                "block_ids",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["unit_id", "focuses"],
        additionalProperties: false,
      },
    },
  },
  required: ["schema_version", "document_id", "units"],
  additionalProperties: false,
} as const;

export function validateTeachingGrounding(
  value: unknown,
  plan: TeachingPlan,
  layout: DocumentLayout,
): TeachingGrounding {
  if (
    !isRecord(value) ||
    value.schema_version !== TEACHING_GROUNDING_SCHEMA_VERSION ||
    value.document_id !== plan.document_id ||
    !Array.isArray(value.units) ||
    value.units.length !== plan.units.length
  ) {
    throw new Error("The teaching grounding has invalid metadata.");
  }

  const focusIds = new Set<string>();
  const layoutPages = new Map(
    layout.pages.map((page) => [page.page_index, page]),
  );

  for (const [unitIndex, groundingUnit] of value.units.entries()) {
    const planUnit = plan.units[unitIndex];

    if (
      !isRecord(groundingUnit) ||
      groundingUnit.unit_id !== planUnit.id ||
      !Array.isArray(groundingUnit.focuses) ||
      groundingUnit.focuses.length === 0 ||
      groundingUnit.focuses.length > 24
    ) {
      throw new Error("The teaching grounding has an invalid unit.");
    }

    const sourcePages = new Set(
      planUnit.source_anchors.map((anchor) => anchor.page_index),
    );
    const lessonStepIndexes = new Map(
      planUnit.lesson_steps.map((step, stepIndex) => [step.id, stepIndex]),
    );
    const coveredLessonSteps = new Set<string>();
    let previousLessonStepIndex = -1;

    for (const focus of groundingUnit.focuses) {
      const lessonStepIndex = isRecord(focus)
        ? lessonStepIndexes.get(
            typeof focus.lesson_step_id === "string"
              ? focus.lesson_step_id
              : "",
          )
        : undefined;

      if (
        !isRecord(focus) ||
        !isFocusId(focus.id) ||
        focusIds.has(focus.id) ||
        lessonStepIndex === undefined ||
        lessonStepIndex < previousLessonStepIndex ||
        !isNonEmptyString(focus.teaching_point) ||
        !isPositiveInteger(focus.page_index) ||
        !sourcePages.has(focus.page_index) ||
        !isUniqueStringArray(focus.block_ids, 1, 6)
      ) {
        throw new Error("The teaching grounding has an invalid focus.");
      }

      const page = layoutPages.get(focus.page_index);
      const pageBlockIds = new Set(page?.blocks.map((block) => block.id));

      if (
        !page ||
        !focus.block_ids.every((blockId) => pageBlockIds.has(blockId))
      ) {
        throw new Error(
          "The teaching grounding references an invalid layout block.",
        );
      }

      focusIds.add(focus.id);
      coveredLessonSteps.add(planUnit.lesson_steps[lessonStepIndex].id);
      previousLessonStepIndex = lessonStepIndex;
    }

    if (
      planUnit.lesson_steps.some(
        (step) => !coveredLessonSteps.has(step.id),
      )
    ) {
      throw new Error(
        "The teaching grounding does not cover every lesson step.",
      );
    }
  }

  return value as TeachingGrounding;
}

function isFocusId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^focus:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
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
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

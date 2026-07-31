import type { DocumentLayout } from "@/lib/document-layout";
import type { TeachingPlan } from "@/lib/teaching-plan";

export const TEACHING_GROUNDING_SCHEMA_VERSION = 1;

export type TeachingVisualFocus = {
  id: string;
  teaching_guidance_index: number;
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
      minItems: 1,
      maxItems: 120,
      items: {
        type: "object",
        properties: {
          unit_id: { type: "string" },
          focuses: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  pattern: "^focus:[a-z0-9]+(?:-[a-z0-9]+)*$",
                },
                teaching_guidance_index: {
                  type: "integer",
                  minimum: 0,
                  maximum: 7,
                },
                teaching_point: { type: "string" },
                page_index: { type: "integer", minimum: 1 },
                block_ids: {
                  type: "array",
                  minItems: 1,
                  maxItems: 6,
                  items: { type: "string" },
                },
              },
              required: [
                "id",
                "teaching_guidance_index",
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
      groundingUnit.focuses.length > 16
    ) {
      throw new Error("The teaching grounding has an invalid unit.");
    }

    const sourcePages = new Set(
      planUnit.source_anchors.map((anchor) => anchor.page_index),
    );
    const coveredGuidance = new Set<number>();

    for (const focus of groundingUnit.focuses) {
      if (
        !isRecord(focus) ||
        !isFocusId(focus.id) ||
        focusIds.has(focus.id) ||
        !isGuidanceIndex(
          focus.teaching_guidance_index,
          planUnit.teaching_guidance.length,
        ) ||
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
      coveredGuidance.add(focus.teaching_guidance_index);
    }

    if (
      planUnit.teaching_guidance.some(
        (_, guidanceIndex) => !coveredGuidance.has(guidanceIndex),
      )
    ) {
      throw new Error(
        "The teaching grounding does not cover every teaching move.",
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

function isGuidanceIndex(
  value: unknown,
  guidanceCount: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < guidanceCount
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

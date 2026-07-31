import type { DocumentModel } from "@/lib/document-model";

export const TEACHING_PLAN_SCHEMA_VERSION = 2;

const sourcePurposes = [
  "introduce",
  "explain",
  "illustrate",
  "apply",
] as const;

const lessonStepKinds = [
  "motivate",
  "explain",
  "demonstrate",
  "contrast",
  "connect",
  "practice",
  "assess",
  "recap",
] as const;

export type TeachingSourcePurpose = (typeof sourcePurposes)[number];
export type TeachingLessonStepKind = (typeof lessonStepKinds)[number];

export type TeachingSourceAnchor = {
  page_index: number;
  page_label: string;
  purpose: TeachingSourcePurpose;
};

export type TeachingLessonStep = {
  id: string;
  kind: TeachingLessonStepKind;
  title: string;
  content: string;
  learner_prompt: string | null;
  expected_response: string | null;
  remediation: string | null;
};

export type TeachingUnit = {
  id: string;
  title: string;
  objective: string;
  concept_ids: string[];
  prerequisite_unit_ids: string[];
  source_anchors: TeachingSourceAnchor[];
  lesson_steps: TeachingLessonStep[];
  mastery_criteria: string[];
  common_difficulties: string[];
};

export type TeachingPlan = {
  schema_version: number;
  document_id: string;
  title: string;
  units: TeachingUnit[];
};

export type TeachingPlanSummary = {
  unit_count: number;
};

export const teachingPlanJsonSchema = {
  type: "object",
  properties: {
    schema_version: {
      type: "integer",
      enum: [TEACHING_PLAN_SCHEMA_VERSION],
    },
    document_id: { type: "string" },
    title: { type: "string" },
    units: {
      type: "array",
      minItems: 1,
      maxItems: 120,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            pattern: "^unit:[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          title: { type: "string" },
          objective: { type: "string" },
          concept_ids: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "string" },
          },
          prerequisite_unit_ids: {
            type: "array",
            maxItems: 12,
            items: { type: "string" },
          },
          source_anchors: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                page_index: { type: "integer", minimum: 1 },
                page_label: { type: "string" },
                purpose: {
                  type: "string",
                  enum: sourcePurposes,
                },
              },
              required: ["page_index", "page_label", "purpose"],
              additionalProperties: false,
            },
          },
          lesson_steps: {
            type: "array",
            minItems: 6,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  pattern: "^step:[a-z0-9]+(?:-[a-z0-9]+)*$",
                },
                kind: {
                  type: "string",
                  enum: lessonStepKinds,
                },
                title: { type: "string" },
                content: {
                  type: "string",
                  minLength: 80,
                },
                learner_prompt: {
                  type: ["string", "null"],
                },
                expected_response: {
                  type: ["string", "null"],
                },
                remediation: {
                  type: ["string", "null"],
                },
              },
              required: [
                "id",
                "kind",
                "title",
                "content",
                "learner_prompt",
                "expected_response",
                "remediation",
              ],
              additionalProperties: false,
            },
          },
          mastery_criteria: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          common_difficulties: {
            type: "array",
            maxItems: 8,
            items: { type: "string" },
          },
        },
        required: [
          "id",
          "title",
          "objective",
          "concept_ids",
          "prerequisite_unit_ids",
          "source_anchors",
          "lesson_steps",
          "mastery_criteria",
          "common_difficulties",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["schema_version", "document_id", "title", "units"],
  additionalProperties: false,
} as const;

export function summarizeTeachingPlan(
  plan: TeachingPlan,
): TeachingPlanSummary {
  return {
    unit_count: plan.units.length,
  };
}

export function validateTeachingPlan(
  value: unknown,
  model: DocumentModel,
): TeachingPlan {
  if (!isRecord(value)) {
    throw new Error("The generated teaching plan is not an object.");
  }

  if (
    value.schema_version !== TEACHING_PLAN_SCHEMA_VERSION ||
    value.document_id !== model.document_id ||
    value.title !== model.title ||
    !Array.isArray(value.units) ||
    value.units.length === 0 ||
    value.units.length > 120
  ) {
    throw new Error("The generated teaching plan has invalid metadata.");
  }

  const documentConceptIds = new Set(
    model.concepts.map((concept) => concept.id),
  );
  const earlierUnitIds = new Set<string>();
  const lessonStepIds = new Set<string>();

  for (const unit of value.units) {
    if (!isRecord(unit)) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    const {
      id,
      title,
      objective,
      concept_ids: conceptIds,
      prerequisite_unit_ids: prerequisiteUnitIds,
      source_anchors: sourceAnchors,
      lesson_steps: lessonSteps,
      mastery_criteria: masteryCriteria,
      common_difficulties: commonDifficulties,
    } = unit;

    if (
      !isUnitId(id) ||
      earlierUnitIds.has(id) ||
      !isNonEmptyString(title) ||
      !isNonEmptyString(objective)
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    if (
      !isStringArray(conceptIds, 1, 12) ||
      !hasUniqueValues(conceptIds) ||
      !conceptIds.every((conceptId) =>
        documentConceptIds.has(conceptId),
      )
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    if (
      !isStringArray(prerequisiteUnitIds, 0, 12) ||
      !hasUniqueValues(prerequisiteUnitIds) ||
      !prerequisiteUnitIds.every((prerequisiteId) =>
        earlierUnitIds.has(prerequisiteId),
      )
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    if (
      !Array.isArray(sourceAnchors) ||
      sourceAnchors.length === 0 ||
      sourceAnchors.length > 20
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    if (
      !Array.isArray(lessonSteps) ||
      lessonSteps.length < 6 ||
      lessonSteps.length > 10 ||
      !isStringArray(masteryCriteria, 1, 8) ||
      !isStringArray(commonDifficulties, 0, 8)
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    const unitStepKinds = new Set<TeachingLessonStepKind>();

    for (const step of lessonSteps) {
      if (
        !isRecord(step) ||
        !isLessonStepId(step.id) ||
        lessonStepIds.has(step.id) ||
        !isLessonStepKind(step.kind) ||
        !isNonEmptyString(step.title) ||
        !isSubstantiveString(step.content) ||
        !hasValidInteraction(step)
      ) {
        throw new Error(
          "The generated teaching plan has an invalid lesson step.",
        );
      }

      lessonStepIds.add(step.id);
      unitStepKinds.add(step.kind);
    }

    if (
      lessonSteps[0].kind !== "motivate" ||
      lessonSteps.at(-1)?.kind !== "recap" ||
      !["explain", "demonstrate", "practice", "assess"].every((kind) =>
        unitStepKinds.has(kind as TeachingLessonStepKind),
      )
    ) {
      throw new Error(
        "The generated teaching plan has an incomplete lesson flow.",
      );
    }

    const groundedOccurrences = model.concepts
      .filter((concept) => conceptIds.includes(concept.id))
      .flatMap((concept) => concept.occurrences);

    for (const anchor of sourceAnchors) {
      if (
        !isRecord(anchor) ||
        !isPositiveInteger(anchor.page_index) ||
        anchor.page_index > model.page_count ||
        typeof anchor.page_label !== "string" ||
        !isSourcePurpose(anchor.purpose)
      ) {
        throw new Error(
          "The generated teaching plan has an invalid source anchor.",
        );
      }

      const groundedOccurrence = groundedOccurrences.find(
        (occurrence) => occurrence.page_index === anchor.page_index,
      );

      if (!groundedOccurrence) {
        throw new Error(
          "The generated teaching plan has an invalid source anchor.",
        );
      }

      anchor.page_label = groundedOccurrence.page_label;
    }

    earlierUnitIds.add(id);
  }

  return value as TeachingPlan;
}

function isUnitId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^unit:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isLessonStepId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^step:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isLessonStepKind(
  value: unknown,
): value is TeachingLessonStepKind {
  return (
    typeof value === "string" &&
    lessonStepKinds.includes(value as TeachingLessonStepKind)
  );
}

function hasValidInteraction(step: Record<string, unknown>) {
  const values = [
    step.learner_prompt,
    step.expected_response,
    step.remediation,
  ];
  const hasInteraction = values.every(isNonEmptyString);
  const hasNoInteraction = values.every((value) => value === null);

  if (step.kind === "practice" || step.kind === "assess") {
    return hasInteraction;
  }

  return hasNoInteraction;
}

function isSourcePurpose(value: unknown): value is TeachingSourcePurpose {
  return (
    typeof value === "string" &&
    sourcePurposes.includes(value as TeachingSourcePurpose)
  );
}

function isStringArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    value.every(isNonEmptyString)
  );
}

function hasUniqueValues(values: string[]) {
  return new Set(values).size === values.length;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSubstantiveString(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().length >= 80;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0
  );
}

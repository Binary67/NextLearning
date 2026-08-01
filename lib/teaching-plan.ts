import type { DocumentModel } from "@/lib/document-model";

export const TEACHING_PLAN_SCHEMA_VERSION = 4;
export const TEACHING_UNIT_DETAILS_SCHEMA_VERSION = 1;

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
  id: string;
  page_index: number;
  page_label: string;
  purpose: TeachingSourcePurpose;
  grounding_summary: string;
};

export type TeachingLessonStepOutline = {
  id: string;
  kind: TeachingLessonStepKind;
  title: string;
  visual_source_anchor_id: string | null;
};

export type TeachingUnitOutline = {
  id: string;
  title: string;
  objective: string;
  concept_ids: string[];
  prerequisite_unit_ids: string[];
  source_anchors: TeachingSourceAnchor[];
  lesson_steps: TeachingLessonStepOutline[];
};

export type TeachingLessonStepDetails = {
  id: string;
  content: string;
  learner_prompt: string | null;
  expected_response: string | null;
  remediation: string | null;
};

export type TeachingUnitDetails = {
  schema_version: number;
  document_id: string;
  unit_id: string;
  lesson_steps: TeachingLessonStepDetails[];
  mastery_criteria: string[];
  common_difficulties: string[];
};

export type TeachingUnitDetailsById = Record<string, TeachingUnitDetails>;

export type TeachingLessonStep = TeachingLessonStepOutline &
  Omit<TeachingLessonStepDetails, "id">;

export type TeachingUnit = Omit<TeachingUnitOutline, "lesson_steps"> & {
  lesson_steps: TeachingLessonStep[];
  mastery_criteria: string[];
  common_difficulties: string[];
};

export type TeachingPlan = {
  schema_version: number;
  document_id: string;
  title: string;
  units: TeachingUnitOutline[];
};

export type TeachingPlanSummary = {
  unit_count: number;
};

const sourceAnchorJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    page_index: { type: "integer" },
    page_label: { type: "string" },
    purpose: {
      type: "string",
      enum: sourcePurposes,
    },
    grounding_summary: { type: "string" },
  },
  required: [
    "id",
    "page_index",
    "page_label",
    "purpose",
    "grounding_summary",
  ],
  additionalProperties: false,
} as const;

const lessonStepOutlineJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    kind: {
      type: "string",
      enum: lessonStepKinds,
    },
    title: { type: "string" },
    visual_source_anchor_id: {
      type: ["string", "null"],
    },
  },
  required: ["id", "kind", "title", "visual_source_anchor_id"],
  additionalProperties: false,
} as const;

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
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          objective: { type: "string" },
          concept_ids: {
            type: "array",
            items: { type: "string" },
          },
          prerequisite_unit_ids: {
            type: "array",
            items: { type: "string" },
          },
          source_anchors: {
            type: "array",
            items: sourceAnchorJsonSchema,
          },
          lesson_steps: {
            type: "array",
            items: lessonStepOutlineJsonSchema,
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
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["schema_version", "document_id", "title", "units"],
  additionalProperties: false,
} as const;

export const teachingUnitDetailsJsonSchema = {
  type: "object",
  properties: {
    schema_version: {
      type: "integer",
      enum: [TEACHING_UNIT_DETAILS_SCHEMA_VERSION],
    },
    document_id: { type: "string" },
    unit_id: { type: "string" },
    lesson_steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          content: { type: "string" },
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
      items: { type: "string" },
    },
    common_difficulties: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "schema_version",
    "document_id",
    "unit_id",
    "lesson_steps",
    "mastery_criteria",
    "common_difficulties",
  ],
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
  const sourceAnchorIds = new Set<string>();

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
    } = unit;

    if (
      !isUnitId(id) ||
      earlierUnitIds.has(id) ||
      !isNonEmptyString(title) ||
      !isNonEmptyString(objective) ||
      !isStringArray(conceptIds, 1, 12) ||
      !hasUniqueValues(conceptIds) ||
      !conceptIds.every((conceptId) => documentConceptIds.has(conceptId)) ||
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
      sourceAnchors.length > 20 ||
      !Array.isArray(lessonSteps) ||
      lessonSteps.length < 6 ||
      lessonSteps.length > 10
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    const groundedOccurrences = model.concepts
      .filter((concept) => conceptIds.includes(concept.id))
      .flatMap((concept) => concept.occurrences);
    const unitSourceAnchorIds = new Set<string>();

    for (const anchor of sourceAnchors) {
      if (
        !isRecord(anchor) ||
        !isSourceAnchorId(anchor.id) ||
        sourceAnchorIds.has(anchor.id) ||
        !isPositiveInteger(anchor.page_index) ||
        anchor.page_index > model.page_count ||
        typeof anchor.page_label !== "string" ||
        !isSourcePurpose(anchor.purpose) ||
        !isGroundingSummary(anchor.grounding_summary)
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

      sourceAnchorIds.add(anchor.id);
      unitSourceAnchorIds.add(anchor.id);
      anchor.page_label = groundedOccurrence.page_label;
    }

    const unitStepKinds = new Set<TeachingLessonStepKind>();

    for (const step of lessonSteps) {
      if (
        !isRecord(step) ||
        !isLessonStepId(step.id) ||
        lessonStepIds.has(step.id) ||
        !isLessonStepKind(step.kind) ||
        !isNonEmptyString(step.title) ||
        (step.visual_source_anchor_id !== null &&
          (typeof step.visual_source_anchor_id !== "string" ||
            !unitSourceAnchorIds.has(step.visual_source_anchor_id)))
      ) {
        throw new Error(
          "The generated teaching plan has an invalid lesson step outline.",
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

    earlierUnitIds.add(id);
  }

  return value as TeachingPlan;
}

export function validateTeachingUnitDetails(
  value: unknown,
  plan: TeachingPlan,
  unit: TeachingUnitOutline,
): TeachingUnitDetails {
  if (
    !isRecord(value) ||
    value.schema_version !== TEACHING_UNIT_DETAILS_SCHEMA_VERSION ||
    value.document_id !== plan.document_id ||
    value.unit_id !== unit.id ||
    !Array.isArray(value.lesson_steps) ||
    value.lesson_steps.length !== unit.lesson_steps.length ||
    !isStringArray(value.mastery_criteria, 1, 8) ||
    !isStringArray(value.common_difficulties, 0, 8)
  ) {
    throw new Error("The generated teaching unit has invalid metadata.");
  }

  for (const [index, step] of value.lesson_steps.entries()) {
    const outline = unit.lesson_steps[index];

    if (
      !isRecord(step) ||
      step.id !== outline.id ||
      !isSubstantiveString(step.content) ||
      !hasValidInteraction(step, outline.kind)
    ) {
      throw new Error(
        "The generated teaching unit has an invalid lesson step.",
      );
    }
  }

  return value as TeachingUnitDetails;
}

export function assembleTeachingUnit(
  outline: TeachingUnitOutline,
  details: TeachingUnitDetails,
): TeachingUnit {
  const detailsByStepId = new Map(
    details.lesson_steps.map((step) => [step.id, step]),
  );
  const lessonSteps = outline.lesson_steps.map((step) => {
    const stepDetails = detailsByStepId.get(step.id);

    if (!stepDetails) {
      throw new Error("The teaching unit details are incomplete.");
    }

    return {
      ...step,
      content: stepDetails.content,
      learner_prompt: stepDetails.learner_prompt,
      expected_response: stepDetails.expected_response,
      remediation: stepDetails.remediation,
    };
  });

  return {
    ...outline,
    lesson_steps: lessonSteps,
    mastery_criteria: details.mastery_criteria,
    common_difficulties: details.common_difficulties,
  };
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

function isSourceAnchorId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^source:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
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

function hasValidInteraction(
  step: Record<string, unknown>,
  kind: TeachingLessonStepKind,
) {
  const values = [
    step.learner_prompt,
    step.expected_response,
    step.remediation,
  ];
  const hasInteraction = values.every(isNonEmptyString);
  const hasNoInteraction = values.every((value) => value === null);

  if (kind === "practice" || kind === "assess") {
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

function isGroundingSummary(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().length >= 40;
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

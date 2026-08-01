import type { DocumentModel } from "@/lib/document-model";

export const TEACHING_PLAN_SCHEMA_VERSION = 5;
export const TEACHING_UNIT_DETAILS_SCHEMA_VERSION = 1;

const pageDispositions = ["teach", "skip"] as const;

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

export type TeachingPageDisposition = (typeof pageDispositions)[number];
export type TeachingLessonStepKind = (typeof lessonStepKinds)[number];

export type TeachingSourceChunk = {
  id: string;
  title: string;
  summary: string;
  concept_ids: string[];
};

export type TeachingPageCoverage = {
  page_index: number;
  page_label: string;
  disposition: TeachingPageDisposition;
  reason: string;
  chunks: TeachingSourceChunk[];
};

export type TeachingSourceChunkWithPage = TeachingSourceChunk & {
  page_index: number;
  page_label: string;
};

export type TeachingLessonStepOutline = {
  id: string;
  kind: TeachingLessonStepKind;
  title: string;
  source_chunk_ids: string[];
  visual_source_chunk_id: string | null;
};

export type TeachingUnitOutline = {
  id: string;
  title: string;
  objective: string;
  prerequisite_unit_ids: string[];
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
  page_coverage: TeachingPageCoverage[];
  units: TeachingUnitOutline[];
};

export type TeachingPlanSummary = {
  unit_count: number;
};

const sourceChunkJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    concept_ids: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["id", "title", "summary", "concept_ids"],
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
    source_chunk_ids: {
      type: "array",
      items: { type: "string" },
    },
    visual_source_chunk_id: {
      type: ["string", "null"],
    },
  },
  required: [
    "id",
    "kind",
    "title",
    "source_chunk_ids",
    "visual_source_chunk_id",
  ],
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
    page_coverage: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page_index: { type: "integer" },
          page_label: { type: "string" },
          disposition: {
            type: "string",
            enum: pageDispositions,
          },
          reason: { type: "string" },
          chunks: {
            type: "array",
            items: sourceChunkJsonSchema,
          },
        },
        required: [
          "page_index",
          "page_label",
          "disposition",
          "reason",
          "chunks",
        ],
        additionalProperties: false,
      },
    },
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          objective: { type: "string" },
          prerequisite_unit_ids: {
            type: "array",
            items: { type: "string" },
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
          "prerequisite_unit_ids",
          "lesson_steps",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "schema_version",
    "document_id",
    "title",
    "page_coverage",
    "units",
  ],
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

export function findTeachingSourceChunk(
  plan: TeachingPlan,
  chunkId: string,
): TeachingSourceChunkWithPage | null {
  for (const page of plan.page_coverage) {
    const chunk = page.chunks.find((item) => item.id === chunkId);

    if (chunk) {
      return {
        ...chunk,
        page_index: page.page_index,
        page_label: page.page_label,
      };
    }
  }

  return null;
}

export function getTeachingUnitSourceChunks(
  plan: TeachingPlan,
  unit: TeachingUnitOutline,
): TeachingSourceChunkWithPage[] {
  const chunkIds = new Set(
    unit.lesson_steps.flatMap((step) => step.source_chunk_ids),
  );

  return plan.page_coverage.flatMap((page) =>
    page.chunks
      .filter((chunk) => chunkIds.has(chunk.id))
      .map((chunk) => ({
        ...chunk,
        page_index: page.page_index,
        page_label: page.page_label,
      })),
  );
}

export function getTeachingUnitConceptIds(
  plan: TeachingPlan,
  unit: TeachingUnitOutline,
) {
  return [
    ...new Set(
      getTeachingUnitSourceChunks(plan, unit).flatMap(
        (chunk) => chunk.concept_ids,
      ),
    ),
  ];
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
    !Array.isArray(value.page_coverage) ||
    value.page_coverage.length !== model.page_count ||
    !Array.isArray(value.units) ||
    value.units.length === 0 ||
    value.units.length > 120
  ) {
    throw new Error("The generated teaching plan has invalid metadata.");
  }

  const documentConceptsById = new Map(
    model.concepts.map((concept) => [concept.id, concept]),
  );
  const sourceChunkIds = new Set<string>();
  const sourceChunkConceptIds = new Map<string, string[]>();
  const sourceChunkPageIndexes = new Map<string, number>();
  for (const [index, page] of value.page_coverage.entries()) {
    if (
      !isRecord(page) ||
      page.page_index !== index + 1 ||
      !isNonEmptyString(page.page_label) ||
      !isPageDisposition(page.disposition) ||
      !isNonEmptyString(page.reason) ||
      !Array.isArray(page.chunks) ||
      page.chunks.length > 20 ||
      (page.disposition === "teach" && page.chunks.length === 0) ||
      (page.disposition === "skip" && page.chunks.length !== 0)
    ) {
      throw new Error(
        "The generated teaching plan has invalid page coverage.",
      );
    }

    for (const chunk of page.chunks) {
      if (
        !isRecord(chunk) ||
        !isSourceChunkId(chunk.id) ||
        sourceChunkIds.has(chunk.id) ||
        !isNonEmptyString(chunk.title) ||
        !isSourceSummary(chunk.summary) ||
        !isStringArray(chunk.concept_ids, 1, 12) ||
        !hasUniqueValues(chunk.concept_ids)
      ) {
        throw new Error(
          "The generated teaching plan has an invalid source chunk.",
        );
      }

      const isGrounded = chunk.concept_ids.every((conceptId) => {
        const concept = documentConceptsById.get(conceptId);
        const occurrence = concept?.occurrences.find(
          (item) => item.page_index === page.page_index,
        );

        return occurrence?.page_label === page.page_label;
      });

      if (!isGrounded) {
        throw new Error(
          "The generated teaching plan has an invalid source chunk.",
        );
      }

      sourceChunkIds.add(chunk.id);
      sourceChunkConceptIds.set(chunk.id, chunk.concept_ids);
      sourceChunkPageIndexes.set(chunk.id, page.page_index);
    }
  }

  if (sourceChunkIds.size === 0 || sourceChunkIds.size > 400) {
    throw new Error(
      "The generated teaching plan has invalid page coverage.",
    );
  }

  const earlierUnitIds = new Set<string>();
  const lessonStepIds = new Set<string>();
  const assignedSourceChunkIds = new Set<string>();

  for (const unit of value.units) {
    if (!isRecord(unit)) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    const {
      id,
      title,
      objective,
      prerequisite_unit_ids: prerequisiteUnitIds,
      lesson_steps: lessonSteps,
    } = unit;

    if (
      !isUnitId(id) ||
      earlierUnitIds.has(id) ||
      !isNonEmptyString(title) ||
      !isNonEmptyString(objective) ||
      !isStringArray(prerequisiteUnitIds, 0, 12) ||
      !hasUniqueValues(prerequisiteUnitIds) ||
      !prerequisiteUnitIds.every((prerequisiteId) =>
        earlierUnitIds.has(prerequisiteId),
      )
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    if (
      !Array.isArray(lessonSteps) ||
      lessonSteps.length < 6 ||
      lessonSteps.length > 10
    ) {
      throw new Error("The generated teaching plan has an invalid unit.");
    }

    const unitStepKinds = new Set<TeachingLessonStepKind>();
    const unitConceptIds = new Set<string>();

    for (const step of lessonSteps) {
      if (
        !isRecord(step) ||
        !isLessonStepId(step.id) ||
        lessonStepIds.has(step.id) ||
        !isLessonStepKind(step.kind) ||
        !isNonEmptyString(step.title) ||
        !isStringArray(step.source_chunk_ids, 1, 8) ||
        !hasUniqueValues(step.source_chunk_ids) ||
        !step.source_chunk_ids.every((chunkId) =>
          sourceChunkIds.has(chunkId),
        ) ||
        (step.visual_source_chunk_id !== null &&
          (typeof step.visual_source_chunk_id !== "string" ||
            !step.source_chunk_ids.includes(step.visual_source_chunk_id)))
      ) {
        throw new Error(
          "The generated teaching plan has an invalid lesson step outline.",
        );
      }

      lessonStepIds.add(step.id);
      unitStepKinds.add(step.kind);

      for (const chunkId of step.source_chunk_ids) {
        assignedSourceChunkIds.add(chunkId);

        for (const conceptId of sourceChunkConceptIds.get(chunkId) ?? []) {
          unitConceptIds.add(conceptId);
        }
      }
    }

    if (
      unitConceptIds.size === 0 ||
      unitConceptIds.size > 12 ||
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

  if (
    [...sourceChunkIds].some(
      (chunkId) => !assignedSourceChunkIds.has(chunkId),
    )
  ) {
    throw new Error(
      "The generated teaching plan leaves source chunks uncovered.",
    );
  }

  const firstTaughtPageIndex = value.page_coverage.find(
    (page) => isRecord(page) && page.disposition === "teach",
  )?.page_index;
  const firstUnit = value.units[0] as TeachingUnitOutline;
  const startsWithFirstTaughtPage =
    typeof firstTaughtPageIndex === "number" &&
    firstUnit.lesson_steps.some((step) =>
      step.source_chunk_ids.some(
        (chunkId) =>
          sourceChunkPageIndexes.get(chunkId) === firstTaughtPageIndex,
      ),
    );

  if (!startsWithFirstTaughtPage) {
    throw new Error(
      "The generated teaching plan does not begin with document orientation.",
    );
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

function isSourceChunkId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^chunk:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
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

function isPageDisposition(
  value: unknown,
): value is TeachingPageDisposition {
  return (
    typeof value === "string" &&
    pageDispositions.includes(value as TeachingPageDisposition)
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

function isSourceSummary(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().length >= 40;
}

function isSubstantiveString(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().length >= 80;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

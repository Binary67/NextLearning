import type { TeachingPlan, TeachingUnit } from "@/lib/teaching-plan";

export const LEARNING_PROGRESS_SCHEMA_VERSION = 1;

export type UnitMasteryProgress = {
  status: "mastered";
  mastery_evidence: string;
  updated_at: string;
};

export type LearningProgress = {
  schema_version: number;
  document_id: string;
  unit_progress: Record<string, UnitMasteryProgress>;
  updated_at: string;
};

export function createLearningProgress(
  documentId: string,
  updatedAt = new Date().toISOString(),
): LearningProgress {
  return {
    schema_version: LEARNING_PROGRESS_SCHEMA_VERSION,
    document_id: documentId,
    unit_progress: {},
    updated_at: updatedAt,
  };
}

export function validateLearningProgress(
  value: unknown,
  documentId: string,
  plan: TeachingPlan,
): LearningProgress {
  if (
    !isRecord(value) ||
    value.schema_version !== LEARNING_PROGRESS_SCHEMA_VERSION ||
    value.document_id !== documentId ||
    !isRecord(value.unit_progress) ||
    !isIsoTimestamp(value.updated_at)
  ) {
    throw new Error("The saved learning progress is invalid.");
  }

  const unitIds = new Set(plan.units.map((unit) => unit.id));

  for (const [unitId, progress] of Object.entries(value.unit_progress)) {
    if (
      !unitIds.has(unitId) ||
      !isRecord(progress) ||
      progress.status !== "mastered" ||
      !isNonEmptyString(progress.mastery_evidence) ||
      !isIsoTimestamp(progress.updated_at)
    ) {
      throw new Error("The saved learning progress is invalid.");
    }
  }

  return value as LearningProgress;
}

export function findActiveTeachingUnit(
  plan: TeachingPlan,
  progress: LearningProgress,
): TeachingUnit | null {
  const masteredUnitIds = new Set(Object.keys(progress.unit_progress));

  return (
    plan.units.find(
      (unit) =>
        !masteredUnitIds.has(unit.id) &&
        unit.prerequisite_unit_ids.every((id) => masteredUnitIds.has(id)),
    ) ?? null
  );
}

export function markUnitMastered(
  progress: LearningProgress,
  unit: TeachingUnit,
  masteryEvidence: string,
  updatedAt = new Date().toISOString(),
): LearningProgress {
  return {
    ...progress,
    unit_progress: {
      ...progress.unit_progress,
      [unit.id]: {
        status: "mastered",
        mastery_evidence: masteryEvidence.trim(),
        updated_at: updatedAt,
      },
    },
    updated_at: updatedAt,
  };
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = new Date(value);

  return (
    !Number.isNaN(timestamp.valueOf()) &&
    timestamp.toISOString() === value
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

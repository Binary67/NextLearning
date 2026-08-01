import type { TeachingPlan } from "@/lib/teaching-plan";

export const TUTORIAL_GENERATION_STATUS_SCHEMA_VERSION = 1;

export type TeachingUnitGenerationState =
  | "pending"
  | "generating"
  | "ready"
  | "failed";

export type TutorialGenerationStatus = {
  schema_version: number;
  document_id: string;
  unit_status: Record<string, TeachingUnitGenerationState>;
  updated_at: string;
};

export function createTutorialGenerationStatus(
  plan: TeachingPlan,
  readyUnitId: string,
  updatedAt = new Date().toISOString(),
): TutorialGenerationStatus {
  return {
    schema_version: TUTORIAL_GENERATION_STATUS_SCHEMA_VERSION,
    document_id: plan.document_id,
    unit_status: Object.fromEntries(
      plan.units.map((unit) => [
        unit.id,
        unit.id === readyUnitId ? "ready" : "pending",
      ]),
    ),
    updated_at: updatedAt,
  };
}

export function validateTutorialGenerationStatus(
  value: unknown,
  plan: TeachingPlan,
): TutorialGenerationStatus {
  if (
    !isRecord(value) ||
    value.schema_version !== TUTORIAL_GENERATION_STATUS_SCHEMA_VERSION ||
    value.document_id !== plan.document_id ||
    !isRecord(value.unit_status) ||
    !isIsoTimestamp(value.updated_at)
  ) {
    throw new Error("The saved tutorial generation status is invalid.");
  }

  const planUnitIds = new Set(plan.units.map((unit) => unit.id));
  const storedUnitIds = Object.keys(value.unit_status);

  if (
    storedUnitIds.length !== planUnitIds.size ||
    !storedUnitIds.every((unitId) => planUnitIds.has(unitId))
  ) {
    throw new Error("The saved tutorial generation status is invalid.");
  }

  for (const state of Object.values(value.unit_status)) {
    if (!isTeachingUnitGenerationState(state)) {
      throw new Error("The saved tutorial generation status is invalid.");
    }
  }

  return value as TutorialGenerationStatus;
}

export function setTeachingUnitGenerationState(
  status: TutorialGenerationStatus,
  unitId: string,
  state: TeachingUnitGenerationState,
  updatedAt = new Date().toISOString(),
): TutorialGenerationStatus {
  if (!(unitId in status.unit_status)) {
    throw new Error("The teaching unit generation status is unavailable.");
  }

  return {
    ...status,
    unit_status: {
      ...status.unit_status,
      [unitId]: state,
    },
    updated_at: updatedAt,
  };
}

export function hasPendingTeachingUnits(status: TutorialGenerationStatus) {
  return Object.values(status.unit_status).some(
    (state) => state === "pending" || state === "generating",
  );
}

function isTeachingUnitGenerationState(
  value: unknown,
): value is TeachingUnitGenerationState {
  return (
    value === "pending" ||
    value === "generating" ||
    value === "ready" ||
    value === "failed"
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

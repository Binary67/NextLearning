import {
  summarizeDocumentModel,
  type DocumentMapSummary,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  listStoredTutorialIds,
  readDocumentModel,
  readLearningProgress,
  readStoredTutorial,
  readTeachingPlan,
  readTeachingUnitDetails,
  readTutorialGenerationStatus,
  type StoredTutorial,
} from "@/lib/document-storage";
import {
  type LearningProgress,
  validateLearningProgress,
} from "@/lib/learning-progress";
import {
  summarizeTeachingPlan,
  type TeachingPlan,
  type TeachingPlanSummary,
  type TeachingUnitDetailsById,
  validateTeachingPlan,
  validateTeachingUnitDetails,
} from "@/lib/teaching-plan";
import {
  type TutorialGenerationStatus,
  validateTutorialGenerationStatus,
} from "@/lib/tutorial-generation-status";

type PreparedTutorialOutline = {
  tutorial: StoredTutorial;
  model: DocumentModel;
  plan: TeachingPlan;
  progress: LearningProgress;
  generationStatus: TutorialGenerationStatus;
};

export type PreparedTutorial = PreparedTutorialOutline & {
  unitDetails: TeachingUnitDetailsById;
};

export type TutorialResponse = {
  id: string;
  title: string;
  documentName: string;
  type: "pdf";
  url: string;
  createdAt: string;
  updatedAt: string;
  masteredUnitCount: number;
  map: DocumentMapSummary;
  plan: TeachingPlanSummary;
};

export async function listPreparedTutorials() {
  const tutorialIds = await listStoredTutorialIds();
  const tutorials = await Promise.all(
    tutorialIds.map((tutorialId) =>
      readPreparedTutorialOutline(tutorialId),
    ),
  );

  return tutorials
    .filter(
      (tutorial): tutorial is PreparedTutorialOutline => tutorial !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.progress.updated_at) -
        Date.parse(left.progress.updated_at),
    );
}

export async function readPreparedTutorial(
  tutorialId: string,
): Promise<PreparedTutorial | null> {
  const prepared = await readPreparedTutorialOutline(tutorialId);

  if (!prepared) {
    return null;
  }

  const unitsWithPossibleDetails = prepared.plan.units.filter((unit) => {
    const state = prepared.generationStatus.unit_status[unit.id];
    return state === "ready" || state === "generating";
  });
  const storedUnitDetails = await Promise.all(
    unitsWithPossibleDetails.map((unit) =>
      readTeachingUnitDetails(tutorialId, unit.id),
    ),
  );
  const unitDetails: TeachingUnitDetailsById = {};

  for (const [index, storedDetails] of storedUnitDetails.entries()) {
    if (!storedDetails) {
      continue;
    }

    const unit = unitsWithPossibleDetails[index];
    unitDetails[unit.id] = validateTeachingUnitDetails(
      storedDetails,
      prepared.plan,
      unit,
    );
  }

  return {
    ...prepared,
    unitDetails,
  };
}

export function toTutorialResponse(
  prepared: Pick<
    PreparedTutorialOutline,
    "tutorial" | "model" | "plan" | "progress"
  >,
): TutorialResponse {
  const { tutorial, model, plan, progress } = prepared;

  return {
    id: tutorial.id,
    title: tutorial.title,
    documentName: tutorial.documentName,
    type: tutorial.type,
    url: `/api/tutorials/${tutorial.id}/file`,
    createdAt: tutorial.createdAt,
    updatedAt: progress.updated_at,
    masteredUnitCount: Object.keys(progress.unit_progress).length,
    map: summarizeDocumentModel(model),
    plan: summarizeTeachingPlan(plan),
  };
}

async function readPreparedTutorialOutline(
  tutorialId: string,
): Promise<PreparedTutorialOutline | null> {
  const [
    tutorial,
    storedModel,
    storedPlan,
    storedProgress,
    storedGenerationStatus,
  ] = await Promise.all([
    readStoredTutorial(tutorialId),
    readDocumentModel(tutorialId),
    readTeachingPlan(tutorialId),
    readLearningProgress(tutorialId),
    readTutorialGenerationStatus(tutorialId),
  ]);

  if (
    !tutorial ||
    !storedModel ||
    !storedPlan ||
    !storedProgress ||
    !storedGenerationStatus
  ) {
    return null;
  }

  if (tutorial.id !== tutorialId) {
    throw new Error("The saved tutorial metadata is invalid.");
  }

  const model = validateDocumentModel(storedModel, tutorialId);
  const plan = validateTeachingPlan(storedPlan, model);
  const progress = validateLearningProgress(
    storedProgress,
    tutorialId,
    plan,
  );
  const generationStatus = validateTutorialGenerationStatus(
    storedGenerationStatus,
    plan,
  );

  return {
    tutorial,
    model,
    plan,
    progress,
    generationStatus,
  };
}

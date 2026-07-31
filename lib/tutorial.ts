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
  validateTeachingPlan,
} from "@/lib/teaching-plan";

export type PreparedTutorial = {
  tutorial: StoredTutorial;
  model: DocumentModel;
  plan: TeachingPlan;
  progress: LearningProgress;
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
    tutorialIds.map((tutorialId) => readPreparedTutorial(tutorialId)),
  );

  return tutorials
    .filter((tutorial): tutorial is PreparedTutorial => tutorial !== null)
    .sort(
      (left, right) =>
        Date.parse(right.progress.updated_at) -
        Date.parse(left.progress.updated_at),
    );
}

export async function readPreparedTutorial(
  tutorialId: string,
): Promise<PreparedTutorial | null> {
  const [tutorial, storedModel, storedPlan, storedProgress] =
    await Promise.all([
      readStoredTutorial(tutorialId),
      readDocumentModel(tutorialId),
      readTeachingPlan(tutorialId),
      readLearningProgress(tutorialId),
    ]);

  if (!tutorial || !storedModel || !storedPlan || !storedProgress) {
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

  return {
    tutorial,
    model,
    plan,
    progress,
  };
}

export function toTutorialResponse(
  prepared: Pick<
    PreparedTutorial,
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

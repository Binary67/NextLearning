import {
  type DocumentLayout,
  validateDocumentLayout,
} from "@/lib/document-layout";
import {
  summarizeDocumentModel,
  type DocumentMapSummary,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  listStoredTutorialIds,
  readDocumentLayout,
  readDocumentModel,
  readLearningProgress,
  readStoredTutorial,
  readTeachingGrounding,
  readTeachingPlan,
  type StoredTutorial,
} from "@/lib/document-storage";
import {
  type LearningProgress,
  validateLearningProgress,
} from "@/lib/learning-progress";
import {
  type TeachingGrounding,
  validateTeachingGrounding,
} from "@/lib/teaching-grounding";
import {
  summarizeTeachingPlan,
  type TeachingPlan,
  type TeachingPlanSummary,
  validateTeachingPlan,
} from "@/lib/teaching-plan";

export type PreparedTutorial = {
  tutorial: StoredTutorial;
  model: DocumentModel;
  layout: DocumentLayout;
  plan: TeachingPlan;
  grounding: TeachingGrounding;
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
  const [
    tutorial,
    storedModel,
    storedLayout,
    storedPlan,
    storedGrounding,
    storedProgress,
  ] = await Promise.all([
    readStoredTutorial(tutorialId),
    readDocumentModel(tutorialId),
    readDocumentLayout(tutorialId),
    readTeachingPlan(tutorialId),
    readTeachingGrounding(tutorialId),
    readLearningProgress(tutorialId),
  ]);

  if (
    !tutorial ||
    !storedModel ||
    !storedLayout ||
    !storedPlan ||
    !storedGrounding ||
    !storedProgress
  ) {
    return null;
  }

  if (tutorial.id !== tutorialId) {
    throw new Error("The saved tutorial metadata is invalid.");
  }

  const model = validateDocumentModel(storedModel, tutorialId);
  const layout = validateDocumentLayout(
    storedLayout,
    tutorialId,
    model.page_count,
  );
  const plan = validateTeachingPlan(storedPlan, model);
  const grounding = validateTeachingGrounding(
    storedGrounding,
    plan,
    layout,
  );
  const progress = validateLearningProgress(
    storedProgress,
    tutorialId,
    plan,
  );

  return {
    tutorial,
    model,
    layout,
    plan,
    grounding,
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

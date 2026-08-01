import {
  summarizeDocumentModel,
  type DocumentMapSummary,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  listStoredTutorialIds,
  readDocumentModel,
  readStoredTutorial,
  type StoredTutorial,
} from "@/lib/document-storage";

export type PreparedTutorial = {
  tutorial: StoredTutorial;
  model: DocumentModel;
};

export type TutorialResponse = {
  id: string;
  title: string;
  documentName: string;
  url: string;
  createdAt: string;
  map: DocumentMapSummary;
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
        Date.parse(right.tutorial.createdAt) -
        Date.parse(left.tutorial.createdAt),
    );
}

export async function readPreparedTutorial(
  tutorialId: string,
): Promise<PreparedTutorial | null> {
  const [tutorial, storedModel] = await Promise.all([
    readStoredTutorial(tutorialId),
    readDocumentModel(tutorialId),
  ]);

  if (!tutorial || !storedModel) {
    return null;
  }

  if (tutorial.id !== tutorialId) {
    throw new Error("The saved tutorial metadata is invalid.");
  }

  return {
    tutorial,
    model: validateDocumentModel(storedModel, tutorialId),
  };
}

export function toTutorialResponse(
  prepared: PreparedTutorial,
): TutorialResponse {
  const { tutorial, model } = prepared;

  return {
    id: tutorial.id,
    title: tutorial.title,
    documentName: tutorial.documentName,
    url: `/api/tutorials/${tutorial.id}/file`,
    createdAt: tutorial.createdAt,
    map: summarizeDocumentModel(model),
  };
}

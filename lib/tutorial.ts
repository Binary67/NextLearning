import {
  summarizeDocumentModel,
  type DocumentMapSummary,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  hasDocumentEmbeddings,
  listStoredTutorials,
  readDocumentModel,
  readStoredTutorial,
  type StoredTutorial,
  type TutorialStatus,
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
  status: TutorialStatus;
  error: string | null;
  map: DocumentMapSummary | null;
};

export async function listTutorials() {
  const storedTutorials = await listStoredTutorials();
  const tutorialResults = await Promise.allSettled(
    storedTutorials.map(async (tutorial) => {
      if (tutorial.status !== "ready") {
        return toTutorialResponse(tutorial);
      }

      const prepared = await readPreparedTutorial(tutorial.id);

      if (!prepared) {
        throw new Error("The prepared tutorial data is incomplete.");
      }

      return toTutorialResponse(prepared.tutorial, prepared.model);
    }),
  );
  const tutorials: TutorialResponse[] = [];

  for (const [index, result] of tutorialResults.entries()) {
    if (result.status === "rejected") {
      console.error(
        `Stored tutorial ${storedTutorials[index].id} could not be loaded:`,
        result.reason,
      );
      continue;
    }

    tutorials.push(result.value);
  }

  return tutorials.sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}

export async function readPreparedTutorial(
  tutorialId: string,
): Promise<PreparedTutorial | null> {
  const [tutorial, storedModel, embeddingsAvailable] = await Promise.all([
    readStoredTutorial(tutorialId),
    readDocumentModel(tutorialId),
    hasDocumentEmbeddings(tutorialId),
  ]);

  if (
    !tutorial ||
    tutorial.status !== "ready" ||
    !storedModel ||
    !embeddingsAvailable
  ) {
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
  tutorial: StoredTutorial,
  model?: DocumentModel,
): TutorialResponse {
  return {
    id: tutorial.id,
    title: tutorial.title,
    documentName: tutorial.documentName,
    url: `/api/tutorials/${tutorial.id}/file`,
    createdAt: tutorial.createdAt,
    status: tutorial.status,
    error: tutorial.error,
    map: model ? summarizeDocumentModel(model) : null,
  };
}

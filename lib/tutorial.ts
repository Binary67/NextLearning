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
import {
  type LearningProgressSummary,
  summarizeLearningProgress,
} from "@/lib/learning-progress";
import { readLearningState } from "@/lib/learning-state-store";
import { LruPromiseCache } from "@/lib/lru-promise-cache";

const preparedDocumentModelCache = new LruPromiseCache<
  string,
  DocumentModel
>(100);

class MissingPreparedDocumentModelError extends Error {}

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
  learningSummary: LearningProgressSummary | null;
};

export async function listTutorials(now = new Date()) {
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

      const learningState = await readLearningState(
        tutorial.id,
        prepared.model,
        now,
      );

      return toTutorialResponse(
        prepared.tutorial,
        prepared.model,
        summarizeLearningProgress(prepared.model, learningState, now),
      );
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
  const [tutorial, embeddingsAvailable] = await Promise.all([
    readStoredTutorial(tutorialId),
    hasDocumentEmbeddings(tutorialId),
  ]);

  if (
    !tutorial ||
    tutorial.status !== "ready" ||
    !embeddingsAvailable
  ) {
    return null;
  }

  const model = await readPreparedDocumentModel(
    tutorialId,
    tutorial.updatedAt,
  );

  if (!model) {
    return null;
  }

  if (tutorial.id !== tutorialId) {
    throw new Error("The saved tutorial metadata is invalid.");
  }

  return {
    tutorial,
    model,
  };
}

async function readPreparedDocumentModel(
  tutorialId: string,
  updatedAt: string,
): Promise<DocumentModel | null> {
  try {
    return await preparedDocumentModelCache.getOrCreate(
      `${tutorialId}\0${updatedAt}`,
      async () => {
        const storedModel = await readDocumentModel(tutorialId);

        if (!storedModel) {
          throw new MissingPreparedDocumentModelError();
        }

        return validateDocumentModel(storedModel, tutorialId);
      },
    );
  } catch (error) {
    if (error instanceof MissingPreparedDocumentModelError) {
      return null;
    }

    throw error;
  }
}

export function toTutorialResponse(
  tutorial: StoredTutorial,
  model?: DocumentModel,
  learningSummary?: LearningProgressSummary | null,
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
    learningSummary: learningSummary ?? null,
  };
}

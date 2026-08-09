import {
  summarizeDocumentModel,
  type DocumentMapSummary,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  readPublishedDocumentModel,
} from "@/lib/document-artifact-storage";
import {
  listStoredTutorials,
  readStoredTutorial,
} from "@/lib/tutorial-storage";
import type {
  StoredTutorial,
  TutorialStatus,
} from "@/lib/document-storage-types";
import {
  type LearningProgressSummary,
  summarizeLearningProgress,
} from "@/lib/learning-progress";
import { readLearningState } from "@/lib/learning-state-store";
import { LruPromiseCache } from "@/lib/lru-promise-cache";

const availableDocumentModelCache = new LruPromiseCache<
  string,
  DocumentModel
>(100);

class MissingAvailableDocumentModelError extends Error {}

export type TutorialAvailability = {
  batchCount: number;
  pageCount: number;
};

export type AvailableTutorial = {
  tutorial: StoredTutorial;
  model: DocumentModel;
  publishedBatchCount: number;
};

export type PreparedTutorial = AvailableTutorial;

export type TutorialResponse = {
  id: string;
  title: string;
  documentName: string;
  url: string;
  createdAt: string;
  status: TutorialStatus;
  error: string | null;
  sourcePageCount: number;
  availability: TutorialAvailability | null;
  map: DocumentMapSummary | null;
  learningSummary: LearningProgressSummary | null;
};

export async function listTutorials(now = new Date()) {
  const storedTutorials = await listStoredTutorials();
  const tutorialResults = await Promise.allSettled(
    storedTutorials.map(async (tutorial) => {
      const available = await readAvailableTutorial(tutorial.id);

      if (!available) {
        return toTutorialResponse(tutorial);
      }

      let learningSummary: LearningProgressSummary | null = null;

      try {
        const learningState = await readLearningState(
          tutorial.id,
          available.model,
          now,
        );
        learningSummary = summarizeLearningProgress(
          available.model,
          learningState,
          now,
        );
      } catch (error) {
        console.error(
          `Learning progress for stored tutorial ${tutorial.id} could not be loaded:`,
          error,
        );
      }

      return toTutorialResponse(
        available.tutorial,
        available.model,
        learningSummary,
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

export async function readAvailableTutorial(
  tutorialId: string,
): Promise<AvailableTutorial | null> {
  const tutorial = await readStoredTutorial(tutorialId);

  if (
    !tutorial ||
    tutorial.status === "queued" ||
    tutorial.publishedBatchCount === null
  ) {
    return null;
  }

  const model = await readAvailableDocumentModel(
    tutorialId,
    tutorial.publishedBatchCount,
  );

  if (!model) {
    return null;
  }

  if (
    tutorial.status === "ready" &&
    model.page_count < tutorial.sourcePageCount
  ) {
    return null;
  }

  if (tutorial.id !== tutorialId) {
    throw new Error("The saved tutorial metadata is invalid.");
  }

  return {
    tutorial,
    model,
    publishedBatchCount: tutorial.publishedBatchCount,
  };
}

export const readPreparedTutorial = readAvailableTutorial;

async function readAvailableDocumentModel(
  tutorialId: string,
  publishedBatchCount: number,
): Promise<DocumentModel | null> {
  try {
    return await availableDocumentModelCache.getOrCreate(
      `${tutorialId}\0${publishedBatchCount}`,
      async () => {
        const storedModel = await readPublishedDocumentModel(
          tutorialId,
          publishedBatchCount,
        );

        if (!storedModel) {
          throw new MissingAvailableDocumentModelError();
        }

        return validateDocumentModel(storedModel, tutorialId);
      },
    );
  } catch (error) {
    if (error instanceof MissingAvailableDocumentModelError) {
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
    sourcePageCount: tutorial.sourcePageCount,
    availability:
      model && typeof tutorial.publishedBatchCount === "number"
        ? {
            batchCount: tutorial.publishedBatchCount,
            pageCount: model.page_count,
          }
        : null,
    map: model ? summarizeDocumentModel(model) : null,
    learningSummary: learningSummary ?? null,
  };
}

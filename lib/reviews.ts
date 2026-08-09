import type { DocumentModel } from "@/lib/document-model";
import { listStoredTutorialIds } from "@/lib/tutorial-storage";
import type {
  LearningAttemptResult,
  LearningState,
} from "@/lib/learning-state";
import { readLearningState } from "@/lib/learning-state-store";
import { readPreparedTutorial } from "@/lib/tutorial";

export type ReviewQueueItem = {
  tutorialId: string;
  tutorialTitle: string;
  conceptId: string;
  conceptName: string;
  definition: string;
  chunkId: string;
  pageIndex: number;
  pageLabel: string;
  dueAt: string;
  lastResult: LearningAttemptResult;
  lastConfidence: 1 | 2 | 3 | null;
  misconception: string | null;
};

export type ReviewQueueTutorial = {
  tutorialId: string;
  tutorialTitle: string;
  model: DocumentModel;
  learningState: LearningState;
};

type RankedReviewQueueItem = {
  item: ReviewQueueItem;
  prerequisiteImportance: number;
};

const resultPriority: Record<LearningAttemptResult, number> = {
  incorrect: 0,
  partial: 1,
  correct: 2,
};

export async function readDueReviews(now = new Date()) {
  const tutorialIds = await listStoredTutorialIds();
  const tutorials = await Promise.all(
    tutorialIds.map(async (tutorialId) => {
      const prepared = await readPreparedTutorial(tutorialId);

      if (!prepared) {
        return null;
      }

      return {
        tutorialId,
        tutorialTitle: prepared.tutorial.title,
        model: prepared.model,
        learningState: await readLearningState(
          tutorialId,
          prepared.model,
          now,
        ),
      } satisfies ReviewQueueTutorial;
    }),
  );

  return buildDueReviewQueue(
    tutorials.filter(
      (tutorial): tutorial is ReviewQueueTutorial =>
        tutorial !== null,
    ),
    now,
  );
}

export function buildDueReviewQueue(
  tutorials: ReviewQueueTutorial[],
  now = new Date(),
): ReviewQueueItem[] {
  const nowTimestamp = now.getTime();
  const rankedItems: RankedReviewQueueItem[] = [];

  for (const tutorial of tutorials) {
    const concepts = new Map(
      tutorial.model.concepts.map((concept) => [
        concept.id,
        concept,
      ]),
    );
    const chunks = new Map(
      tutorial.model.pages.flatMap((page) =>
        page.chunks.map((chunk) => [
          chunk.id,
          { chunk, page },
        ] as const),
      ),
    );
    const prerequisiteImportance = new Map<string, number>();

    for (const connection of tutorial.model.connections) {
      if (connection.relationship === "prerequisite_for") {
        prerequisiteImportance.set(
          connection.from,
          (prerequisiteImportance.get(connection.from) ?? 0) + 1,
        );
      }
    }

    for (const state of Object.values(
      tutorial.learningState.concepts,
    )) {
      if (
        state.nextReviewAt === null ||
        Date.parse(state.nextReviewAt) > nowTimestamp
      ) {
        continue;
      }

      const concept = concepts.get(state.conceptId);
      const location = chunks.get(state.lastChunkId);

      if (!concept || !location) {
        continue;
      }

      rankedItems.push({
        item: {
          tutorialId: tutorial.tutorialId,
          tutorialTitle: tutorial.tutorialTitle,
          conceptId: concept.id,
          conceptName: concept.name,
          definition: concept.definition,
          chunkId: location.chunk.id,
          pageIndex: location.page.page_index,
          pageLabel: location.page.page_label,
          dueAt: state.nextReviewAt,
          lastResult: state.lastResult,
          lastConfidence: state.lastConfidence,
          misconception: state.misconception,
        },
        prerequisiteImportance:
          prerequisiteImportance.get(concept.id) ?? 0,
      });
    }
  }

  return rankedItems
    .sort(
      (left, right) =>
        Date.parse(left.item.dueAt) -
          Date.parse(right.item.dueAt) ||
        resultPriority[left.item.lastResult] -
          resultPriority[right.item.lastResult] ||
        right.prerequisiteImportance -
          left.prerequisiteImportance ||
        left.item.tutorialId.localeCompare(right.item.tutorialId) ||
        left.item.conceptId.localeCompare(right.item.conceptId),
    )
    .map(({ item }) => item);
}

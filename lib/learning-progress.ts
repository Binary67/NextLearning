import type { DocumentModel } from "@/lib/document-model";
import type { LearningState } from "@/lib/learning-state";

export type LearningProgressSummary = {
  practiced: number;
  total: number;
  mastered: number;
  reviewing: number;
  learning: number;
  notPracticed: number;
  dueNow: number;
  nextReviewAt: string | null;
};

export function summarizeLearningProgress(
  model: DocumentModel,
  learningState: LearningState,
  now: Date,
): LearningProgressSummary {
  const nowTimestamp = now.getTime();
  let mastered = 0;
  let reviewing = 0;
  let learning = 0;
  let dueNow = 0;
  let nextReviewTimestamp = Number.POSITIVE_INFINITY;
  let nextReviewAt: string | null = null;

  for (const state of Object.values(learningState.concepts)) {
    if (state.status === "mastered") {
      mastered += 1;
    } else if (state.status === "reviewing") {
      reviewing += 1;
    } else {
      learning += 1;
    }

    if (state.nextReviewAt !== null) {
      const reviewTimestamp = Date.parse(state.nextReviewAt);

      if (reviewTimestamp <= nowTimestamp) {
        dueNow += 1;
      } else if (reviewTimestamp < nextReviewTimestamp) {
        nextReviewTimestamp = reviewTimestamp;
        nextReviewAt = state.nextReviewAt;
      }
    }
  }

  const practiced = mastered + reviewing + learning;
  const total = model.concepts.length;

  return {
    practiced,
    total,
    mastered,
    reviewing,
    learning,
    notPracticed: total - practiced,
    dueNow,
    nextReviewAt,
  };
}

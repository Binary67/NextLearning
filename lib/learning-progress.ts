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

  for (const state of Object.values(learningState.concepts)) {
    if (state.status === "mastered") {
      mastered += 1;
    } else if (state.status === "reviewing") {
      reviewing += 1;
    } else {
      learning += 1;
    }

    if (
      state.nextReviewAt !== null &&
      Date.parse(state.nextReviewAt) <= nowTimestamp
    ) {
      dueNow += 1;
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
  };
}

import type { DocumentModel } from "@/lib/document-model";
import {
  readStoredLearningState,
  updateStoredLearningState,
} from "@/lib/stored-progress";
import {
  createEmptyLearningState,
  type LearningState,
  validateLearningState,
} from "@/lib/learning-state";

export async function readLearningState(
  tutorialId: string,
  model: DocumentModel,
  now = new Date(),
) {
  const stored = await readStoredLearningState(tutorialId);

  return stored === null
    ? createEmptyLearningState(tutorialId, now)
    : validateLearningState(stored, tutorialId, model);
}

export function mutateLearningState(
  tutorialId: string,
  model: DocumentModel,
  update: (
    state: LearningState,
    now: Date,
  ) => LearningState,
  now = new Date(),
) {
  return updateStoredLearningState(tutorialId, (stored) => {
    const current =
      stored === null
        ? createEmptyLearningState(tutorialId, now)
        : validateLearningState(stored, tutorialId, model);
    const updated = update(current, now);

    return validateLearningState(updated, tutorialId, model);
  });
}

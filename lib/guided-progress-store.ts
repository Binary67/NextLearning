import type { DocumentModel } from "@/lib/document-model";
import {
  readStoredGuidedProgress,
  updateStoredGuidedProgress,
} from "@/lib/document-storage";
import {
  createEmptyGuidedProgress,
  type GuidedProgressEvent,
  updateGuidedProgress,
  validateGuidedProgress,
} from "@/lib/guided-progress";

export async function readGuidedProgress(
  tutorialId: string,
  model: DocumentModel,
  now = new Date(),
) {
  const stored = await readStoredGuidedProgress(tutorialId);

  return stored === null
    ? createEmptyGuidedProgress(tutorialId, now)
    : validateGuidedProgress(stored, tutorialId, model);
}

export async function readStoredGuidedProgressIfAvailable(
  tutorialId: string,
  model: DocumentModel,
) {
  const stored = await readStoredGuidedProgress(tutorialId);
  return stored === null
    ? null
    : validateGuidedProgress(stored, tutorialId, model);
}

export function recordGuidedProgressEvent(
  tutorialId: string,
  model: DocumentModel,
  event: GuidedProgressEvent,
  now = new Date(),
) {
  return updateStoredGuidedProgress(tutorialId, (stored) => {
    const current =
      stored === null
        ? createEmptyGuidedProgress(tutorialId, now)
        : validateGuidedProgress(stored, tutorialId, model);
    const updated = updateGuidedProgress(
      current,
      event,
      model,
      now,
    );

    return validateGuidedProgress(updated, tutorialId, model);
  });
}

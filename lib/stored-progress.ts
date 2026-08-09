import {
  readJsonFile,
  writeJsonFileAtomically,
} from "@/lib/document-storage-io";
import {
  progressFileName,
  tutorialFilePath,
} from "@/lib/document-storage-paths";
import { validateStoredProgress } from "@/lib/document-storage-validation";
import type { StoredProgress } from "@/lib/document-storage-types";

const progressUpdates = new Map<string, Promise<void>>();

export function readStoredLearningState(
  tutorialId: string,
): Promise<unknown | null> {
  return readStoredProgressValue(tutorialId, "learning");
}

export function readStoredGuidedProgress(
  tutorialId: string,
): Promise<unknown | null> {
  return readStoredProgressValue(tutorialId, "guided");
}

export function updateStoredGuidedProgress<T>(
  tutorialId: string,
  update: (stored: unknown | null) => T | Promise<T>,
): Promise<T> {
  return updateStoredProgress(tutorialId, "guided", update);
}

export function updateStoredLearningState<T>(
  tutorialId: string,
  update: (stored: unknown | null) => T | Promise<T>,
): Promise<T> {
  return updateStoredProgress(tutorialId, "learning", update);
}

async function updateStoredProgress<T>(
  tutorialId: string,
  key: keyof StoredProgress,
  update: (stored: unknown | null) => T | Promise<T>,
): Promise<T> {
  const previous = progressUpdates.get(tutorialId) ?? Promise.resolve();
  let release: () => void = () => {};
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => turn);

  progressUpdates.set(tutorialId, queued);
  await previous;

  try {
    const progress =
      (await readStoredProgress(tutorialId)) ?? emptyStoredProgress();
    const updated = await update(progress[key]);
    await writeJsonFileAtomically(
      tutorialFilePath(tutorialId, progressFileName),
      { ...progress, [key]: updated },
    );
    return updated;
  } finally {
    release();

    if (progressUpdates.get(tutorialId) === queued) {
      progressUpdates.delete(tutorialId);
    }
  }
}

async function readStoredProgressValue(
  tutorialId: string,
  key: keyof StoredProgress,
) {
  return (await readStoredProgress(tutorialId))?.[key] ?? null;
}

async function readStoredProgress(
  tutorialId: string,
): Promise<StoredProgress | null> {
  const value = await readJsonFile<unknown>(
    tutorialFilePath(tutorialId, progressFileName),
  );

  return value === null ? null : validateStoredProgress(value);
}

function emptyStoredProgress(): StoredProgress {
  return {
    guided: null,
    learning: null,
  };
}

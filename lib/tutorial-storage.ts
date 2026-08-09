import { promises as fs } from "node:fs";

import { createDocumentPreparation } from "@/lib/document-batches";
import {
  copyFileAtomically,
  isMissingFileError,
  readJsonFile,
  writeJsonFileAtomically,
} from "@/lib/document-storage-io";
import {
  documentFileName,
  tutorialDirectory,
  tutorialFilePath,
  tutorialMetadataFileName,
  tutorialsDirectory,
} from "@/lib/document-storage-paths";
import {
  isInvalidStoredTutorialMetadataError,
  validateStoredTutorial,
} from "@/lib/document-storage-validation";
import type { StoredTutorial } from "@/lib/document-storage-types";

const tutorialIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTutorialId(value: string) {
  return tutorialIdPattern.test(value);
}

export async function listStoredTutorialIds() {
  try {
    const entries = await fs.readdir(tutorialsDirectory, {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isDirectory() && isTutorialId(entry.name))
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

export async function listStoredTutorials() {
  const tutorialIds = await listStoredTutorialIds();
  const results = await Promise.allSettled(
    tutorialIds.map((tutorialId) => readStoredTutorial(tutorialId)),
  );
  const tutorials: StoredTutorial[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      if (isInvalidStoredTutorialMetadataError(result.reason)) {
        console.error(
          `Stored tutorial ${tutorialIds[index]} could not be loaded:`,
          result.reason,
        );
        continue;
      }

      throw result.reason;
    }

    if (result.value) {
      tutorials.push(result.value);
    }
  }

  return tutorials.sort(
    (left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
}

export async function readStoredTutorial(
  tutorialId: string,
): Promise<StoredTutorial | null> {
  if (!isTutorialId(tutorialId)) {
    return null;
  }

  const value = await readJsonFile<unknown>(
    tutorialFilePath(tutorialId, tutorialMetadataFileName),
  );

  if (value === null) {
    return null;
  }

  return validateStoredTutorial(value, tutorialId);
}

export async function deleteStoredTutorial(tutorialId: string) {
  const tutorial = await readStoredTutorial(tutorialId);

  if (!tutorial) {
    return false;
  }

  await fs.rm(tutorialDirectory(tutorialId), {
    force: true,
    recursive: true,
  });

  return true;
}

export async function createQueuedTutorial(
  documentName: string,
  sourceFilePath: string,
  tutorialId: string,
  sourcePageCount: number,
): Promise<StoredTutorial> {
  const createdAt = new Date().toISOString();
  const tutorial: StoredTutorial = {
    id: tutorialId,
    title: documentName.replace(/\.pdf$/i, ""),
    documentName,
    createdAt,
    updatedAt: createdAt,
    sourcePageCount,
    publishedBatchCount: null,
    status: "queued",
    error: null,
    preparation: createDocumentPreparation(sourcePageCount),
  };

  await fs.mkdir(tutorialDirectory(tutorialId), { recursive: true });
  await copyFileAtomically(
    sourceFilePath,
    tutorialFilePath(tutorialId, documentFileName),
  );
  await writeStoredTutorial(tutorial);

  return tutorial;
}

export async function updateStoredTutorial(
  tutorial: StoredTutorial,
  updates: Partial<
    Pick<
      StoredTutorial,
      | "error"
      | "preparation"
      | "publishedBatchCount"
      | "status"
      | "title"
    >
  >,
) {
  const updatedTutorial: StoredTutorial = {
    ...tutorial,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeStoredTutorial(updatedTutorial);
  return updatedTutorial;
}

export async function markTutorialPrepared(
  tutorial: StoredTutorial,
  title: string,
): Promise<StoredTutorial> {
  return updateStoredTutorial(tutorial, {
    title,
    status: "ready",
    error: null,
  });
}

function writeStoredTutorial(tutorial: StoredTutorial) {
  return writeJsonFileAtomically(
    tutorialFilePath(tutorial.id, tutorialMetadataFileName),
    tutorial,
  );
}

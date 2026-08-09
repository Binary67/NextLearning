import {
  DOCUMENT_BATCH_SIZE,
  type DocumentPreparation,
} from "@/lib/document-batches";
import type {
  StoredProgress,
  StoredTutorial,
  TutorialStatus,
} from "@/lib/document-storage-types";

export class InvalidStoredTutorialError extends Error {}

export function validateStoredTutorial(
  value: unknown,
  tutorialId: string,
): StoredTutorial {
  if (
    !hasExactKeys(value, [
      "id",
      "title",
      "documentName",
      "createdAt",
      "updatedAt",
      "sourcePageCount",
      "status",
      "error",
      "preparation",
    ]) ||
    value.id !== tutorialId ||
    typeof value.title !== "string" ||
    typeof value.documentName !== "string" ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    !isPositiveInteger(value.sourcePageCount) ||
    !isTutorialStatus(value.status) ||
    (value.error !== null && typeof value.error !== "string") ||
    !isDocumentPreparation(value.preparation, value.sourcePageCount)
  ) {
    throw new InvalidStoredTutorialError(
      `Stored tutorial ${tutorialId} has invalid metadata.`,
    );
  }

  return value as StoredTutorial;
}

export function validateStoredProgress(value: unknown): StoredProgress {
  if (
    !isRecord(value) ||
    !("guided" in value) ||
    !("learning" in value)
  ) {
    throw new Error("The saved tutorial progress is invalid.");
  }

  return {
    guided: value.guided,
    learning: value.learning,
  };
}

export function isInvalidStoredTutorialMetadataError(error: unknown) {
  return (
    error instanceof SyntaxError || error instanceof InvalidStoredTutorialError
  );
}

function isDocumentPreparation(
  value: unknown,
  pageCount: number,
): value is DocumentPreparation {
  if (
    !hasExactKeys(value, ["phase", "batches"]) ||
    !["analyzing", "consolidating", "embedding", "complete"].includes(
      value.phase as string,
    ) ||
    !Array.isArray(value.batches)
  ) {
    return false;
  }

  const expectedBatchCount = Math.ceil(pageCount / DOCUMENT_BATCH_SIZE);

  if (value.batches.length !== expectedBatchCount) {
    return false;
  }

  return value.batches.every((batch, index) => {
    const startPage = index * DOCUMENT_BATCH_SIZE + 1;

    return (
      hasExactKeys(batch, [
        "batch_index",
        "start_page",
        "end_page",
        "status",
      ]) &&
      batch.batch_index === index + 1 &&
      batch.start_page === startPage &&
      batch.end_page ===
        Math.min(pageCount, startPage + DOCUMENT_BATCH_SIZE - 1) &&
      ["pending", "processing", "complete"].includes(batch.status as string)
    );
  });
}

function hasExactKeys<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isTutorialStatus(value: unknown): value is TutorialStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

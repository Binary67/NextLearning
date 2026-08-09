import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import type { GeneratedDocumentBatch } from "@/lib/document-batches";
import {
  readJsonFile,
  writeBatchFile,
  writeJsonFileAtomically,
  isMissingFileError,
} from "@/lib/document-storage-io";
import {
  batchFilePath,
  documentFileName,
  documentModelFileName,
  embeddingsDirectoryName,
  generatedBatchesDirectoryName,
  tutorialDirectory,
  tutorialFilePath,
} from "@/lib/document-storage-paths";
import {
  type DocumentModel,
  type GeneratedDocumentBatchValidationContext,
  validateGeneratedDocumentBatch,
} from "@/lib/document-model";
import { readStoredTutorial } from "@/lib/tutorial-storage";
import type { DocumentEmbeddings } from "@/lib/document-embedding-types";

export const MAX_DOCUMENT_SIZE = 512 * 1024 * 1024;

export async function readDocumentFile(tutorialId: string) {
  return fs.readFile(tutorialFilePath(tutorialId, documentFileName));
}

export function documentFilePath(tutorialId: string) {
  return tutorialFilePath(tutorialId, documentFileName);
}

export async function statDocumentFile(tutorialId: string) {
  const stats = await fs.stat(
    tutorialFilePath(tutorialId, documentFileName),
    { bigint: true },
  );
  const identity = [
    stats.dev,
    stats.ino,
    stats.size,
    stats.mtimeNs,
  ].join(":");
  const etag = createHash("sha256")
    .update(identity)
    .digest("base64url");

  return {
    etag: `"${etag}"`,
    size: Number(stats.size),
  };
}

export function streamDocumentFile(
  tutorialId: string,
  range?: { start: number; end: number },
) {
  const stream = createReadStream(
    tutorialFilePath(tutorialId, documentFileName),
    range,
  );

  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

export async function readDocumentModel(
  tutorialId: string,
): Promise<DocumentModel | null> {
  return readJsonFile<DocumentModel>(
    tutorialFilePath(tutorialId, documentModelFileName),
  );
}

export function writeDocumentModel(
  tutorialId: string,
  model: DocumentModel,
) {
  return writeJsonFileAtomically(
    tutorialFilePath(tutorialId, documentModelFileName),
    model,
  );
}

export async function readDocumentEmbeddings(
  tutorialId: string,
): Promise<DocumentEmbeddings | null> {
  const tutorial = await readStoredTutorial(tutorialId);

  if (!tutorial) {
    return null;
  }

  const batches = await Promise.all(
    tutorial.preparation.batches.map(({ batch_index }) =>
      readDocumentEmbeddingBatch(tutorialId, batch_index),
    ),
  );

  if (batches.some((batch) => batch === null)) {
    return null;
  }

  const embeddings = batches as DocumentEmbeddings[];
  const first = embeddings[0];

  if (
    !first ||
    embeddings.some(
      (batch) =>
        batch.deployment !== first.deployment ||
        batch.dimensions !== first.dimensions,
    )
  ) {
    return null;
  }

  return {
    schema_version: first.schema_version,
    document_id: tutorialId,
    deployment: first.deployment,
    dimensions: first.dimensions,
    chunks: embeddings.flatMap((batch) => batch.chunks),
  };
}

export async function readGeneratedDocumentBatch(
  tutorialId: string,
  batchIndex: number,
  context: GeneratedDocumentBatchValidationContext,
) {
  const value = await readJsonFile<unknown>(
    batchFilePath(tutorialId, generatedBatchesDirectoryName, batchIndex),
  );
  return value === null
    ? null
    : validateGeneratedDocumentBatch(value, context);
}

export function writeGeneratedDocumentBatch(
  tutorialId: string,
  batch: GeneratedDocumentBatch,
) {
  return writeBatchFile(
    tutorialId,
    generatedBatchesDirectoryName,
    batch.batch_index,
    batch,
  );
}

export function readDocumentEmbeddingBatch(
  tutorialId: string,
  batchIndex: number,
) {
  return readJsonFile<DocumentEmbeddings>(
    batchFilePath(tutorialId, embeddingsDirectoryName, batchIndex),
  );
}

export function writeDocumentEmbeddingBatch(
  tutorialId: string,
  batchIndex: number,
  embeddings: DocumentEmbeddings,
) {
  return writeBatchFile(
    tutorialId,
    embeddingsDirectoryName,
    batchIndex,
    embeddings,
  );
}

export async function hasDocumentEmbeddings(tutorialId: string) {
  try {
    await fs.access(
      path.join(tutorialDirectory(tutorialId), embeddingsDirectoryName),
    );
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

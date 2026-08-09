import {
  DOCUMENT_EMBEDDINGS_SCHEMA_VERSION,
  type DocumentEmbeddings,
} from "@/lib/document-embedding-types";
import type { DocumentModel } from "@/lib/document-model";

export function validateDocumentEmbeddings(
  value: unknown,
  model: DocumentModel,
): DocumentEmbeddings {
  if (
    !isRecord(value) ||
    value.schema_version !== DOCUMENT_EMBEDDINGS_SCHEMA_VERSION ||
    value.document_id !== model.document_id ||
    !isNonEmptyString(value.deployment) ||
    !isPositiveInteger(value.dimensions) ||
    !Array.isArray(value.chunks)
  ) {
    throw new Error("The saved document embeddings have invalid metadata.");
  }

  const expectedChunkIds = new Set(
    model.pages.flatMap((page) => page.chunks.map((chunk) => chunk.id)),
  );

  if (value.chunks.length !== expectedChunkIds.size) {
    throw new Error("The saved document embeddings are incomplete.");
  }

  const chunkIds = new Set<string>();
  const chunks = value.chunks.map((item) => {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.chunk_id) ||
      !expectedChunkIds.has(item.chunk_id) ||
      chunkIds.has(item.chunk_id) ||
      !Array.isArray(item.embedding) ||
      item.embedding.length !== value.dimensions ||
      !item.embedding.every(isFiniteNumber)
    ) {
      throw new Error("The saved document embeddings are invalid.");
    }

    chunkIds.add(item.chunk_id);

    return {
      chunk_id: item.chunk_id,
      embedding: item.embedding,
    };
  });

  return {
    schema_version: DOCUMENT_EMBEDDINGS_SCHEMA_VERSION,
    document_id: model.document_id,
    deployment: value.deployment,
    dimensions: value.dimensions,
    chunks,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

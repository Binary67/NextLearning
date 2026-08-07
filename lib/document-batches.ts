import type {
  DocumentConcept,
  DocumentConnection,
  DocumentModel,
  GeneratedDocumentPage,
} from "@/lib/document-model";

export const DOCUMENT_BATCH_SIZE = 10;
export const DOCUMENT_BATCH_OVERLAP = 1;
export const DOCUMENT_STORAGE_SCHEMA_VERSION = 1;

export type DocumentBatchRange = {
  batch_index: number;
  start_page: number;
  end_page: number;
};

export type DocumentPreparation = {
  schema_version: number;
  document_id: string;
  phase: "analyzing" | "consolidating" | "embedding" | "complete";
  page_count: number;
  batch_size: number;
  batches: Array<
    DocumentBatchRange & {
      status: "pending" | "processing" | "complete";
    }
  >;
};

export type GeneratedDocumentBatch = DocumentBatchRange & {
  schema_version: number;
  document_id: string;
  title: string;
  summary: string;
  pages: GeneratedDocumentPage[];
  concepts: DocumentConcept[];
  connections: DocumentConnection[];
};

export type DocumentBatch = DocumentBatchRange & {
  schema_version: number;
  document_id: string;
  summary: string;
  pages: DocumentModel["pages"];
};

export type DocumentMap = Omit<DocumentModel, "pages"> & {
  storage_schema_version: number;
  chunk_count: number;
  batches: DocumentBatchRange[];
};

export function createDocumentPreparation(
  documentId: string,
  pageCount: number,
): DocumentPreparation {
  const batches: DocumentPreparation["batches"] = [];

  for (
    let startPage = 1, batchIndex = 1;
    startPage <= pageCount;
    startPage += DOCUMENT_BATCH_SIZE, batchIndex += 1
  ) {
    batches.push({
      batch_index: batchIndex,
      start_page: startPage,
      end_page: Math.min(pageCount, startPage + DOCUMENT_BATCH_SIZE - 1),
      status: "pending",
    });
  }

  return {
    schema_version: DOCUMENT_STORAGE_SCHEMA_VERSION,
    document_id: documentId,
    phase: "analyzing",
    page_count: pageCount,
    batch_size: DOCUMENT_BATCH_SIZE,
    batches,
  };
}

export function assembleDocumentModel(
  map: DocumentMap,
  batches: DocumentBatch[],
): DocumentModel {
  return {
    schema_version: map.schema_version,
    document_id: map.document_id,
    title: map.title,
    page_count: map.page_count,
    pages: batches
      .sort((left, right) => left.batch_index - right.batch_index)
      .flatMap((batch) => batch.pages),
    concepts: map.concepts,
    connections: map.connections,
  };
}

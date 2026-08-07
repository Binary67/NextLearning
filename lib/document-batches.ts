import type {
  DocumentConcept,
  DocumentConnection,
  GeneratedDocumentPage,
} from "@/lib/document-model";

export const DOCUMENT_BATCH_SIZE = 10;
export const DOCUMENT_BATCH_OVERLAP = 1;

export type DocumentBatchRange = {
  batch_index: number;
  start_page: number;
  end_page: number;
};

export type DocumentPreparation = {
  phase: "analyzing" | "consolidating" | "embedding" | "complete";
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
  pages: GeneratedDocumentPage[];
  concepts: DocumentConcept[];
  connections: DocumentConnection[];
};

export function createDocumentPreparation(
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
    phase: "analyzing",
    batches,
  };
}

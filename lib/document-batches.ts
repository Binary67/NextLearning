import type {
  DocumentConcept,
  DocumentConnection,
  DocumentPage,
  GeneratedDocumentPage,
} from "@/lib/document-model";

export const DOCUMENT_BATCH_SIZE = 5;
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
  page_count: number;
  pages: GeneratedDocumentPage[];
  concepts: DocumentConcept[];
  connections: DocumentConnection[];
};

export type GroundedGeneratedDocumentBatch = Omit<
  GeneratedDocumentBatch,
  "pages"
> & {
  pages: DocumentPage[];
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

export function getContiguousCompletedBatchCount(
  batches: readonly DocumentPreparation["batches"][number][],
) {
  const orderedBatches = [...batches].sort(
    (left, right) => left.batch_index - right.batch_index,
  );
  let completedCount = 0;

  for (const batch of orderedBatches) {
    if (
      batch.batch_index !== completedCount + 1 ||
      batch.status !== "complete"
    ) {
      break;
    }

    completedCount += 1;
  }

  return completedCount;
}

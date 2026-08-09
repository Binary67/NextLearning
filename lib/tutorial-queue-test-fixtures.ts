import type { DocumentPreparation } from "@/lib/document-batches";
import type { DocumentEmbeddings } from "@/lib/document-embedding-types";
import type { DocumentModel } from "@/lib/document-model";
import type { StoredTutorial } from "@/lib/document-storage-types";
import type { Mock } from "vitest";

export const embeddings: DocumentEmbeddings = {
  schema_version: 1,
  document_id: "tutorial",
  deployment: "embedding-deployment",
  dimensions: 2,
  chunks: [],
};

export function setupTutorialQueueMocks(mocks: Record<string, Mock>) {
  const events: string[] = [];
  let activeMetadataWrites = 0;
  let maxActiveMetadataWrites = 0;
  const generatedArtifacts = new Map<number, unknown>();
  const embeddingArtifacts = new Map<number, DocumentEmbeddings>();

  mocks.listStoredTutorials.mockResolvedValue([]);
  mocks.retryAzureOpenAIRateLimits.mockImplementation(
    (operation: () => Promise<unknown>) => operation(),
  );
  mocks.openPdfBatchReader.mockImplementation(() =>
    Promise.resolve({
      readBatch: mocks.readBatch,
      close: mocks.closeReader,
    }),
  );
  mocks.readBatch.mockImplementation((batch) =>
    Promise.resolve({
      fileData: Buffer.from(`batch ${batch.batch_index}`),
      inputStartPage: batch.start_page,
      inputEndPage: batch.end_page,
    }),
  );
  mocks.closeReader.mockResolvedValue(undefined);
  mocks.readGeneratedDocumentBatch.mockImplementation(
    (_tutorialId: string, batchIndex: number) =>
      Promise.resolve(generatedArtifacts.get(batchIndex) ?? null),
  );
  mocks.hasDocumentEmbeddingBatch.mockImplementation(
    (_tutorialId: string, batchIndex: number) =>
      Promise.resolve(embeddingArtifacts.has(batchIndex)),
  );
  mocks.readDocumentEmbeddingBatch.mockImplementation(
    (_tutorialId: string, batchIndex: number) =>
      Promise.resolve(embeddingArtifacts.get(batchIndex) ?? null),
  );
  mocks.readPublishedDocumentModel.mockImplementation(
    (_tutorialId: string) => Promise.resolve(documentModel(_tutorialId)),
  );
  mocks.consolidateDocumentBatches.mockImplementation(
    (tutorialId: string) => Promise.resolve(documentModel(tutorialId)),
  );
  mocks.generateDocumentBatch.mockImplementation(
    (...args: unknown[]) =>
      Promise.resolve({
        batch_index: args[4],
      }),
  );
  mocks.writeGeneratedDocumentBatch.mockImplementation(
    (_tutorialId: string, batch: { batch_index: number }) => {
      generatedArtifacts.set(batch.batch_index, batch);
      events.push(`generated:${batch.batch_index}`);
      return Promise.resolve();
    },
  );
  mocks.generateDocumentEmbeddingBatches.mockImplementation(
    (_model: DocumentModel, ranges: DocumentPreparation["batches"]) =>
      Promise.resolve(
        ranges.map(({ batch_index }) => ({
          batch_index,
          embeddings,
        })),
      ),
  );
  mocks.writeDocumentEmbeddingBatch.mockImplementation(
    (
      _tutorialId: string,
      batchIndex: number,
      batchEmbeddings: DocumentEmbeddings,
    ) => {
      embeddingArtifacts.set(batchIndex, batchEmbeddings);
      return Promise.resolve();
    },
  );
  mocks.writeDocumentModel.mockResolvedValue(undefined);
  mocks.markTutorialPrepared.mockImplementation(() => {
    events.push("prepared");
    return Promise.resolve();
  });
  mocks.updateStoredTutorial.mockImplementation(
    async (
      storedTutorial: StoredTutorial,
      updates: Partial<StoredTutorial>,
    ) => {
      activeMetadataWrites += 1;
      maxActiveMetadataWrites = Math.max(
        maxActiveMetadataWrites,
        activeMetadataWrites,
      );
      const preparation = updates.preparation ?? storedTutorial.preparation;
      const statuses = preparation.batches
        .map((batch) => `${batch.batch_index}-${batch.status}`)
        .join(",");
      events.push(
        updates.status === "failed"
          ? "failed"
          : `metadata:${storedTutorial.id}:${statuses}`,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      activeMetadataWrites -= 1;
      return {
        ...storedTutorial,
        ...updates,
        updatedAt: storedTutorial.updatedAt,
      };
    },
  );

  return {
    events,
    generatedArtifacts,
    get maxActiveMetadataWrites() {
      return maxActiveMetadataWrites;
    },
  };
}

export function tutorial(
  id: string,
  createdAt: string,
  preparation: DocumentPreparation,
): StoredTutorial {
  return {
    id,
    title: "Preparing tutorial",
    documentName: `${id}.pdf`,
    createdAt,
    updatedAt: createdAt,
    sourcePageCount: Math.max(
      ...preparation.batches.map(({ end_page }) => end_page),
    ),
    publishedBatchCount: null,
    status: "queued",
    error: null,
    preparation,
  };
}

export function batch(
  batchIndex: number,
  startPage: number,
  endPage: number,
  status: DocumentPreparation["batches"][number]["status"],
): DocumentPreparation["batches"][number] {
  return {
    batch_index: batchIndex,
    start_page: startPage,
    end_page: endPage,
    status,
  };
}

export function completePreparation(): DocumentPreparation {
  return {
    phase: "analyzing",
    batches: [batch(1, 1, 1, "complete")],
  };
}

export function documentModel(documentId: string): DocumentModel {
  return {
    schema_version: 5,
    document_id: documentId,
    title: "Prepared tutorial",
    page_count: 1,
    pages: [],
    concepts: [],
    connections: [],
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

export async function waitFor(condition: () => boolean) {
  while (!condition()) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

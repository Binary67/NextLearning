import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentPreparation } from "@/lib/document-batches";
import type { DocumentEmbeddings } from "@/lib/document-embeddings";
import type { DocumentModel } from "@/lib/document-model";
import type { StoredTutorial } from "@/lib/document-storage";

const mocks = vi.hoisted(() => ({
  closeReader: vi.fn(),
  consolidateDocumentBatches: vi.fn(),
  generateDocumentBatch: vi.fn(),
  generateDocumentEmbeddingBatches: vi.fn(),
  listStoredTutorials: vi.fn(),
  markTutorialPrepared: vi.fn(),
  openPdfBatchReader: vi.fn(),
  readBatch: vi.fn(),
  readDocumentFile: vi.fn(),
  readGeneratedDocumentBatch: vi.fn(),
  retryAzureOpenAIRateLimits: vi.fn(),
  updateStoredTutorial: vi.fn(),
  writeDocumentEmbeddingBatch: vi.fn(),
  writeDocumentModel: vi.fn(),
  writeGeneratedDocumentBatch: vi.fn(),
}));

vi.mock("@/lib/azure-openai-generation-retry", () => ({
  MissingAzureOpenAIConfigurationError: class extends Error {},
  retryAzureOpenAIRateLimits: mocks.retryAzureOpenAIRateLimits,
}));

vi.mock("@/lib/document-embeddings", () => ({
  generateDocumentEmbeddingBatches:
    mocks.generateDocumentEmbeddingBatches,
}));

vi.mock("@/lib/document-consolidation", () => ({
  consolidateDocumentBatches: mocks.consolidateDocumentBatches,
}));

vi.mock("@/lib/document-storage", () => ({
  documentFilePath: (tutorialId: string) => `/documents/${tutorialId}.pdf`,
  listStoredTutorials: mocks.listStoredTutorials,
  markTutorialPrepared: mocks.markTutorialPrepared,
  readDocumentFile: mocks.readDocumentFile,
  readGeneratedDocumentBatch: mocks.readGeneratedDocumentBatch,
  updateStoredTutorial: mocks.updateStoredTutorial,
  writeDocumentEmbeddingBatch: mocks.writeDocumentEmbeddingBatch,
  writeDocumentModel: mocks.writeDocumentModel,
  writeGeneratedDocumentBatch: mocks.writeGeneratedDocumentBatch,
}));

vi.mock("@/lib/pdf-document-batches", () => ({
  openPdfBatchReader: mocks.openPdfBatchReader,
}));

vi.mock("@/lib/tutorial-generation", () => ({
  generateDocumentBatch: mocks.generateDocumentBatch,
}));

import { runTutorialQueue } from "@/lib/tutorial-queue";

type QueueState = {
  promise: Promise<void> | null;
  drainRequested: boolean;
  recovered: boolean;
};

const queueGlobal = globalThis as typeof globalThis & {
  nextLearningTutorialQueue?: QueueState;
};

const embeddings: DocumentEmbeddings = {
  schema_version: 1,
  document_id: "tutorial",
  deployment: "embedding-deployment",
  dimensions: 2,
  chunks: [],
};

let events: string[];
let activeMetadataWrites: number;
let maxActiveMetadataWrites: number;

describe("tutorial queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events = [];
    activeMetadataWrites = 0;
    maxActiveMetadataWrites = 0;

    const state = queueGlobal.nextLearningTutorialQueue!;
    state.promise = null;
    state.drainRequested = false;
    state.recovered = false;

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
    mocks.readDocumentFile.mockResolvedValue(Buffer.from("document"));
    mocks.readGeneratedDocumentBatch.mockImplementation(
      (tutorialId: string, batchIndex: number) =>
        Promise.resolve({
          schema_version: 1,
          document_id: tutorialId,
          batch_index: batchIndex,
          start_page: batchIndex,
          end_page: batchIndex,
          title: `Batch ${batchIndex}`,
          pages: [],
          concepts: [],
          connections: [],
        }),
    );
    mocks.consolidateDocumentBatches.mockImplementation(
      (_fileData: Buffer, tutorialId: string) =>
        Promise.resolve(documentModel(tutorialId)),
    );
    mocks.generateDocumentBatch.mockImplementation(
      (...args: unknown[]) =>
        Promise.resolve({
          batch_index: args[4],
        }),
    );
    mocks.writeGeneratedDocumentBatch.mockImplementation(
      (_tutorialId: string, batch: { batch_index: number }) => {
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
    mocks.writeDocumentEmbeddingBatch.mockResolvedValue(undefined);
    mocks.writeDocumentModel.mockResolvedValue(undefined);
    mocks.markTutorialPrepared.mockImplementation(() => {
      events.push("prepared");
      return Promise.resolve();
    });
    mocks.updateStoredTutorial.mockImplementation(
      async (
        tutorial: StoredTutorial,
        updates: Partial<StoredTutorial>,
      ) => {
        activeMetadataWrites += 1;
        maxActiveMetadataWrites = Math.max(
          maxActiveMetadataWrites,
          activeMetadataWrites,
        );
        const preparation = updates.preparation ?? tutorial.preparation;
        const statuses = preparation.batches
          .map((batch) => `${batch.batch_index}-${batch.status}`)
          .join(",");
        events.push(
          updates.status === "failed"
            ? "failed"
            : `metadata:${tutorial.id}:${statuses}`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeMetadataWrites -= 1;
        return {
          ...tutorial,
          ...updates,
          updatedAt: tutorial.updatedAt,
        };
      },
    );
  });

  it("runs two batch workers, serializes progress, and embeds the model once", async () => {
    const preparation: DocumentPreparation = {
      phase: "analyzing",
      batches: [
        batch(3, 21, 30, "pending"),
        batch(1, 1, 10, "pending"),
        batch(2, 11, 20, "complete"),
        batch(4, 31, 40, "pending"),
      ],
    };
    mocks.listStoredTutorials.mockResolvedValue([
      tutorial("tutorial", "2026-08-08T09:00:00.000Z", preparation),
    ]);

    let activeGenerations = 0;
    let maxActiveGenerations = 0;
    mocks.generateDocumentBatch.mockImplementation(
      async (...args: unknown[]) => {
        activeGenerations += 1;
        maxActiveGenerations = Math.max(
          maxActiveGenerations,
          activeGenerations,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeGenerations -= 1;
        return { batch_index: args[4] };
      },
    );

    await runTutorialQueue();

    expect(maxActiveGenerations).toBe(2);
    expect(maxActiveMetadataWrites).toBe(1);
    expect(
      mocks.generateDocumentBatch.mock.calls.map((call) => call[4]),
    ).toEqual([3, 1, 4]);
    expect(
      mocks.readBatch.mock.calls.map(([range]) => range.batch_index),
    ).toEqual([3, 1, 4]);
    expect(mocks.closeReader).toHaveBeenCalledOnce();

    for (const batchIndex of [1, 3, 4]) {
      const generatedIndex = events.indexOf(`generated:${batchIndex}`);
      const completeIndex = events.findIndex(
        (event) =>
          event.startsWith("metadata:tutorial:") &&
          event.includes(`${batchIndex}-complete`),
      );
      expect(generatedIndex).toBeGreaterThan(-1);
      expect(completeIndex).toBeGreaterThan(generatedIndex);
    }
    expect(events).toContain(
      "metadata:tutorial:3-complete,1-complete,2-complete,4-complete",
    );

    expect(mocks.readGeneratedDocumentBatch.mock.calls).toEqual([
      ["tutorial", 1],
      ["tutorial", 2],
      ["tutorial", 3],
      ["tutorial", 4],
    ]);
    expect(mocks.generateDocumentEmbeddingBatches).toHaveBeenCalledOnce();
    expect(mocks.generateDocumentEmbeddingBatches.mock.calls[0][1]).toEqual([
      batch(1, 1, 10, "complete"),
      batch(2, 11, 20, "complete"),
      batch(3, 21, 30, "complete"),
      batch(4, 31, 40, "complete"),
    ]);
    expect(mocks.writeDocumentEmbeddingBatch.mock.calls).toEqual(
      [1, 2, 3, 4].map((batchIndex) => [
        "tutorial",
        batchIndex,
        embeddings,
      ]),
    );
  });

  it("settles active work before terminal failure and starts no later batch", async () => {
    mocks.listStoredTutorials.mockResolvedValue([
      tutorial("failure", "2026-08-08T09:00:00.000Z", {
        phase: "analyzing",
        batches: [
          batch(1, 1, 10, "pending"),
          batch(2, 11, 20, "pending"),
          batch(3, 21, 30, "pending"),
        ],
      }),
    ]);
    const secondGeneration = deferred<{ batch_index: number }>();
    mocks.generateDocumentBatch.mockImplementation(
      (...args: unknown[]) => {
        const batchIndex = args[4] as number;

        if (batchIndex === 1) {
          return Promise.reject(new Error("generation failed"));
        }

        return secondGeneration.promise;
      },
    );

    const queuePromise = runTutorialQueue();
    await waitFor(() => mocks.generateDocumentBatch.mock.calls.length === 2);

    expect(events).not.toContain("failed");
    secondGeneration.resolve({ batch_index: 2 });
    await queuePromise;

    expect(
      mocks.generateDocumentBatch.mock.calls.map((call) => call[4]),
    ).toEqual([1, 2]);
    expect(mocks.closeReader).toHaveBeenCalledOnce();
    expect(events.at(-1)).toBe("failed");
  });

  it("uses one chronological stored snapshot for a drain pass", async () => {
    const newer = tutorial(
      "newer",
      "2026-08-08T10:00:00.000Z",
      completePreparation(),
    );
    const older = tutorial(
      "older",
      "2026-08-08T09:00:00.000Z",
      completePreparation(),
    );
    const processingOrder: string[] = [];
    mocks.listStoredTutorials.mockResolvedValue([newer, older]);
    mocks.updateStoredTutorial.mockImplementation(
      async (
        storedTutorial: StoredTutorial,
        updates: Partial<StoredTutorial>,
      ) => {
        if (updates.status === "processing") {
          processingOrder.push(storedTutorial.id);
        }
        return { ...storedTutorial, ...updates };
      },
    );

    await runTutorialQueue();

    expect(mocks.listStoredTutorials).toHaveBeenCalledOnce();
    expect(processingOrder).toEqual(["older", "newer"]);
    expect(mocks.openPdfBatchReader).not.toHaveBeenCalled();
  });

  it("takes a second snapshot when another drain is requested", async () => {
    mocks.listStoredTutorials
      .mockResolvedValueOnce([
        tutorial(
          "first-pass",
          "2026-08-08T09:00:00.000Z",
          completePreparation(),
        ),
      ])
      .mockResolvedValueOnce([]);
    mocks.markTutorialPrepared.mockImplementationOnce(() => {
      void runTutorialQueue();
      return Promise.resolve();
    });

    await runTutorialQueue();

    expect(mocks.listStoredTutorials).toHaveBeenCalledTimes(2);
  });

  it("requeues interrupted processing and retries its active batch", async () => {
    mocks.listStoredTutorials.mockResolvedValue([
      {
        ...tutorial(
          "interrupted",
          "2026-08-08T09:00:00.000Z",
          {
            phase: "analyzing",
            batches: [batch(1, 1, 10, "processing")],
          },
        ),
        status: "processing",
        error: "interrupted",
      },
    ]);

    await runTutorialQueue();

    expect(mocks.listStoredTutorials).toHaveBeenCalledOnce();
    expect(mocks.updateStoredTutorial).toHaveBeenCalledWith(
      expect.objectContaining({ id: "interrupted" }),
      { status: "queued", error: null },
    );
    expect(mocks.generateDocumentBatch).toHaveBeenCalledOnce();
    expect(mocks.generateDocumentBatch.mock.calls[0][4]).toBe(1);
  });
});

function tutorial(
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
    status: "queued",
    error: null,
    preparation,
  };
}

function batch(
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

function completePreparation(): DocumentPreparation {
  return {
    phase: "analyzing",
    batches: [batch(1, 1, 1, "complete")],
  };
}

function documentModel(documentId: string): DocumentModel {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

async function waitFor(condition: () => boolean) {
  while (!condition()) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

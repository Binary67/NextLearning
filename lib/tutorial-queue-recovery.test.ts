import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentPreparation } from "@/lib/document-batches";
import type { StoredTutorial } from "@/lib/document-storage-types";
import {
  batch,
  setupTutorialQueueMocks,
  tutorial,
} from "@/lib/tutorial-queue-test-fixtures";

const mocks = vi.hoisted(() => ({
  closeReader: vi.fn(),
  consolidateDocumentBatches: vi.fn(),
  generateDocumentBatch: vi.fn(),
  generateDocumentEmbeddingBatches: vi.fn(),
  listStoredTutorials: vi.fn(),
  markTutorialPrepared: vi.fn(),
  openPdfBatchReader: vi.fn(),
  readDocumentEmbeddingBatch: vi.fn(),
  readBatch: vi.fn(),
  readDocumentFile: vi.fn(),
  readGeneratedDocumentBatch: vi.fn(),
  readPublishedDocumentModel: vi.fn(),
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

vi.mock("@/lib/document-embedding-generation", () => ({
  generateDocumentEmbeddingBatches:
    mocks.generateDocumentEmbeddingBatches,
}));

vi.mock("@/lib/document-consolidation", () => ({
  consolidateDocumentBatches: mocks.consolidateDocumentBatches,
}));

vi.mock("@/lib/document-artifact-storage", () => ({
  documentFilePath: (tutorialId: string) => `/documents/${tutorialId}.pdf`,
  readDocumentFile: mocks.readDocumentFile,
  readDocumentEmbeddingBatch: mocks.readDocumentEmbeddingBatch,
  readGeneratedDocumentBatch: mocks.readGeneratedDocumentBatch,
  readPublishedDocumentModel: mocks.readPublishedDocumentModel,
  writeDocumentEmbeddingBatch: mocks.writeDocumentEmbeddingBatch,
  writeDocumentModel: mocks.writeDocumentModel,
  writeGeneratedDocumentBatch: mocks.writeGeneratedDocumentBatch,
}));

vi.mock("@/lib/tutorial-storage", () => ({
  listStoredTutorials: mocks.listStoredTutorials,
  markTutorialPrepared: mocks.markTutorialPrepared,
  updateStoredTutorial: mocks.updateStoredTutorial,
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

describe("tutorial queue recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = queueGlobal.nextLearningTutorialQueue!;
    state.promise = null;
    state.drainRequested = false;
    state.recovered = false;

    setupTutorialQueueMocks(mocks);
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

  it("recovers valid artifacts, processes only missing ranges, and transitions once after analysis", async () => {
    const preparation = {
      phase: "analyzing" as const,
      batches: [
        batch(1, 1, 10, "pending"),
        batch(2, 11, 20, "pending"),
      ],
    };
    const stored = tutorial("checkpoint", "2026-08-08T09:00:00.000Z", preparation);
    const artifacts = new Map<number, unknown>([
      [1, { batch_index: 1 }],
    ]);
    const preparationWrites: DocumentPreparation[] = [];
    mocks.listStoredTutorials.mockResolvedValue([stored]);
    mocks.updateStoredTutorial.mockImplementation(
      async (
        storedTutorial: StoredTutorial,
        updates: Partial<StoredTutorial>,
      ) => {
        if (updates.preparation) {
          preparationWrites.push(structuredClone(updates.preparation));
        }
        return { ...storedTutorial, ...updates };
      },
    );
    mocks.readGeneratedDocumentBatch.mockImplementation(
      (_tutorialId: string, batchIndex: number) =>
        Promise.resolve(artifacts.get(batchIndex) ?? null),
    );
    mocks.writeGeneratedDocumentBatch.mockImplementation(
      (_tutorialId: string, generated: { batch_index: number }) => {
        artifacts.set(generated.batch_index, generated);
        return Promise.resolve();
      },
    );
    await runTutorialQueue();

    expect(mocks.generateDocumentBatch.mock.calls.map((call) => call[4])).toEqual([
      2,
    ]);
    expect(preparationWrites).toHaveLength(5);
    expect(preparationWrites[2].batches).toEqual([
      batch(1, 1, 10, "complete"),
      batch(2, 11, 20, "complete"),
    ]);
    expect(preparationWrites.map((value) => value.phase)).toEqual([
      "analyzing",
      "analyzing",
      "consolidating",
      "embedding",
      "complete",
    ]);
  });

  it("rejects malformed persisted artifacts without processing or deleting them", async () => {
    mocks.listStoredTutorials.mockResolvedValue([
      tutorial("malformed", "2026-08-08T09:00:00.000Z", {
        phase: "analyzing",
        batches: [batch(1, 1, 10, "complete")],
      }),
    ]);
    const malformed = new Error("The generated document batch has invalid metadata.");
    mocks.readGeneratedDocumentBatch.mockRejectedValue(malformed);

    await runTutorialQueue();

    expect(mocks.generateDocumentBatch).not.toHaveBeenCalled();
    expect(mocks.writeGeneratedDocumentBatch).not.toHaveBeenCalled();
    expect(mocks.updateStoredTutorial).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "malformed" }),
      expect.objectContaining({ status: "failed" }),
    );
  });
});

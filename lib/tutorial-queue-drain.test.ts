import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredTutorial } from "@/lib/document-storage-types";
import {
  completePreparation,
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
  hasDocumentEmbeddingBatch: vi.fn(),
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
  hasDocumentEmbeddingBatch: mocks.hasDocumentEmbeddingBatch,
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

let generatedArtifacts: Map<number, unknown>;

describe("tutorial queue drain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = queueGlobal.nextLearningTutorialQueue!;
    state.promise = null;
    state.drainRequested = false;
    state.recovered = false;

    const context = setupTutorialQueueMocks(mocks);
    generatedArtifacts = context.generatedArtifacts;
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
    generatedArtifacts.set(1, { batch_index: 1 });
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
    generatedArtifacts.set(1, { batch_index: 1 });
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
});

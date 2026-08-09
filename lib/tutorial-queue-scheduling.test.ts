import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentPreparation } from "@/lib/document-batches";
import {
  batch,
  deferred,
  embeddings,
  setupTutorialQueueMocks,
  tutorial,
  waitFor,
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

let events: string[];
let generatedArtifacts: Map<number, unknown>;
let queueTestContext: ReturnType<typeof setupTutorialQueueMocks>;

describe("tutorial queue scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = queueGlobal.nextLearningTutorialQueue!;
    state.promise = null;
    state.drainRequested = false;
    state.recovered = false;

    queueTestContext = setupTutorialQueueMocks(mocks);
    events = queueTestContext.events;
    generatedArtifacts = queueTestContext.generatedArtifacts;
  });

  it("runs two ascending workers and publishes each contiguous prefix", async () => {
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
    generatedArtifacts.set(2, { batch_index: 2 });

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
    expect(queueTestContext.maxActiveMetadataWrites).toBe(1);
    expect(
      mocks.generateDocumentBatch.mock.calls.map((call) => call[4]),
    ).toEqual([1, 3, 4]);
    expect(
      mocks.readBatch.mock.calls.map(([range]) => range.batch_index),
    ).toEqual([1, 3, 4]);
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

    expect(mocks.generateDocumentEmbeddingBatches).toHaveBeenCalledTimes(3);
    expect(
      mocks.generateDocumentEmbeddingBatches.mock.calls.map(([, ranges]) =>
        (ranges as DocumentPreparation["batches"]).map(
          ({ batch_index }) => batch_index,
        ),
      ),
    ).toEqual([[1, 2], [3], [4]]);
    expect(mocks.writeDocumentEmbeddingBatch.mock.calls).toEqual(
      [1, 2, 3, 4].map((batchIndex) => [
        "tutorial",
        batchIndex,
        embeddings,
      ]),
    );
  });

  it("does not publish an out-of-order completed batch", async () => {
    mocks.listStoredTutorials.mockResolvedValue([
      tutorial("gap", "2026-08-08T09:00:00.000Z", {
        phase: "analyzing",
        batches: [
          batch(1, 1, 10, "pending"),
          batch(2, 11, 20, "pending"),
        ],
      }),
    ]);
    const firstGeneration = deferred<{ batch_index: number }>();
    mocks.generateDocumentBatch.mockImplementation((...args: unknown[]) =>
      args[4] === 1
        ? firstGeneration.promise
        : Promise.resolve({ batch_index: args[4] }),
    );

    const queuePromise = runTutorialQueue();
    await waitFor(() => mocks.generateDocumentBatch.mock.calls.length === 2);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(
      mocks.updateStoredTutorial.mock.calls.some(
        ([, updates]) => "publishedBatchCount" in updates,
      ),
    ).toBe(false);

    firstGeneration.resolve({ batch_index: 1 });
    await queuePromise;

    expect(
      mocks.updateStoredTutorial.mock.calls
        .filter(([, updates]) => "publishedBatchCount" in updates)
        .map(([, updates]) => updates.publishedBatchCount),
    ).toEqual([2]);
  });

  it("keeps the published prefix when a later batch fails", async () => {
    mocks.listStoredTutorials.mockResolvedValue([
      tutorial("later-failure", "2026-08-08T09:00:00.000Z", {
        phase: "analyzing",
        batches: [
          batch(1, 1, 10, "pending"),
          batch(2, 11, 20, "pending"),
          batch(3, 21, 30, "pending"),
        ],
      }),
    ]);
    mocks.generateDocumentBatch.mockImplementation(async (...args: unknown[]) => {
      if (args[4] === 3) {
        await waitFor(() =>
          mocks.updateStoredTutorial.mock.calls.some(
            ([, updates]) => updates.publishedBatchCount === 2,
          ),
        );
        throw new Error("later batch failed");
      }

      return { batch_index: args[4] };
    });

    await runTutorialQueue();

    expect(
      mocks.updateStoredTutorial.mock.calls
        .filter(([, updates]) => "publishedBatchCount" in updates)
        .map(([, updates]) => updates.publishedBatchCount),
    ).toEqual([2]);
    expect(mocks.updateStoredTutorial).toHaveBeenLastCalledWith(
      expect.objectContaining({ publishedBatchCount: 2 }),
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("does not retry embedding generation at the queue level", async () => {
    mocks.listStoredTutorials.mockResolvedValue([
      tutorial("embedding-failure", "2026-08-08T09:00:00.000Z", {
        phase: "analyzing",
        batches: [batch(1, 1, 1, "complete")],
      }),
    ]);
    generatedArtifacts.set(1, { batch_index: 1 });
    mocks.generateDocumentEmbeddingBatches.mockRejectedValue(
      new Error("embedding failed"),
    );

    await runTutorialQueue();

    expect(mocks.generateDocumentEmbeddingBatches).toHaveBeenCalledOnce();
    expect(mocks.retryAzureOpenAIRateLimits).not.toHaveBeenCalled();
    expect(events.at(-1)).toBe("failed");
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
});

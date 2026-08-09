import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import type { StoredTutorial } from "@/lib/document-storage-types";
import type { LearningState } from "@/lib/learning-state";

const mocks = vi.hoisted(() => ({
  listStoredTutorials: vi.fn(),
  readPublishedDocumentModel: vi.fn(),
  readStoredLearningState: vi.fn(),
  readStoredTutorial: vi.fn(),
  validateDocumentModel: vi.fn(),
}));

vi.mock("@/lib/document-model", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/document-model")>();

  return {
    ...original,
    validateDocumentModel: mocks.validateDocumentModel,
  };
});

vi.mock("@/lib/document-artifact-storage", () => ({
  readPublishedDocumentModel: mocks.readPublishedDocumentModel,
}));

vi.mock("@/lib/tutorial-storage", () => ({
  listStoredTutorials: mocks.listStoredTutorials,
  readStoredTutorial: mocks.readStoredTutorial,
}));

vi.mock("@/lib/stored-progress", () => ({
  readStoredLearningState: mocks.readStoredLearningState,
}));

import {
  listTutorials,
  readAvailableTutorial,
} from "@/lib/tutorial";

describe("available tutorials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readStoredLearningState.mockResolvedValue(null);
    mocks.validateDocumentModel.mockImplementation((value) => value);
  });

  it.each(["processing", "failed"] as const)(
    "accepts a %s tutorial with a published snapshot",
    async (status) => {
      const storedTutorial = tutorial(
        `00000000-0000-4000-8000-00000000000${status === "processing" ? "1" : "2"}`,
        status,
        2,
      );
      const storedModel = model(storedTutorial.id, "Published model");

      mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
      mocks.readPublishedDocumentModel.mockResolvedValue(storedModel);

      await expect(readAvailableTutorial(storedTutorial.id)).resolves.toEqual(
        {
          tutorial: storedTutorial,
          model: storedModel,
          publishedBatchCount: 2,
        },
      );
      expect(mocks.readPublishedDocumentModel).toHaveBeenCalledWith(
        storedTutorial.id,
        2,
      );
    },
  );

  it("does not make a queued tutorial available", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000003",
      "queued",
      2,
    );

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);

    await expect(
      readAvailableTutorial(storedTutorial.id),
    ).resolves.toBeNull();
    expect(mocks.readPublishedDocumentModel).not.toHaveBeenCalled();
  });

  it("requires a ready tutorial snapshot to cover the source document", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000004",
      "ready",
      2,
    );
    const storedModel = model(storedTutorial.id, "Partial model");

    mocks.readStoredTutorial.mockResolvedValue({
      ...storedTutorial,
      sourcePageCount: 2,
    });
    mocks.readPublishedDocumentModel.mockResolvedValue(storedModel);

    await expect(
      readAvailableTutorial(storedTutorial.id),
    ).resolves.toBeNull();
  });

  it("keeps the published prefix available after later failure", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000005",
      "failed",
      2,
    );
    const storedModel = model(storedTutorial.id, "Last published model");

    mocks.readStoredTutorial.mockResolvedValue({
      ...storedTutorial,
      error: "The final batch failed.",
    });
    mocks.readPublishedDocumentModel.mockResolvedValue(storedModel);

    await expect(
      readAvailableTutorial(storedTutorial.id),
    ).resolves.toMatchObject({
      tutorial: { status: "failed", error: "The final batch failed." },
      model: storedModel,
      publishedBatchCount: 2,
    });
  });

  it("shares one validated model read for the same published batch", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000006",
      "processing",
      2,
    );
    let resolveModel: (value: DocumentModel) => void = () => {};
    const storedModel = new Promise<DocumentModel>((resolve) => {
      resolveModel = resolve;
    });

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readPublishedDocumentModel.mockReturnValue(storedModel);

    const firstRead = readAvailableTutorial(storedTutorial.id);
    const secondRead = readAvailableTutorial(storedTutorial.id);

    await vi.waitFor(() => {
      expect(mocks.readPublishedDocumentModel).toHaveBeenCalledTimes(1);
    });
    resolveModel(model(storedTutorial.id, "Concurrent model"));

    const [first, second] = await Promise.all([firstRead, secondRead]);

    expect(first?.model).toBe(second?.model);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(1);
  });

  it("reads a new model when the published batch expands", async () => {
    const tutorialId = "00000000-0000-4000-8000-000000000007";
    const firstTutorial = tutorial(tutorialId, "processing", 1);
    const secondTutorial = tutorial(tutorialId, "processing", 2);
    const firstModel = model(tutorialId, "First model");
    const secondModel = model(tutorialId, "Second model");

    mocks.readStoredTutorial
      .mockResolvedValueOnce(firstTutorial)
      .mockResolvedValueOnce(secondTutorial);
    mocks.readPublishedDocumentModel
      .mockResolvedValueOnce(firstModel)
      .mockResolvedValueOnce(secondModel);

    await expect(readAvailableTutorial(tutorialId)).resolves.toMatchObject({
      model: firstModel,
      publishedBatchCount: 1,
    });
    await expect(readAvailableTutorial(tutorialId)).resolves.toMatchObject({
      model: secondModel,
      publishedBatchCount: 2,
    });

    expect(mocks.readPublishedDocumentModel).toHaveBeenNthCalledWith(
      1,
      tutorialId,
      1,
    );
    expect(mocks.readPublishedDocumentModel).toHaveBeenNthCalledWith(
      2,
      tutorialId,
      2,
    );
  });

  it("does not cache missing or failed model reads", async () => {
    const tutorialId = "00000000-0000-4000-8000-000000000008";
    const storedTutorial = tutorial(tutorialId, "processing", 1);
    const storedModel = model(tutorialId, "Retried model");

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readPublishedDocumentModel
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce(storedModel);

    await expect(readAvailableTutorial(tutorialId)).resolves.toBeNull();
    await expect(readAvailableTutorial(tutorialId)).rejects.toThrow(
      "read failed",
    );
    await expect(readAvailableTutorial(tutorialId)).resolves.toMatchObject({
      model: storedModel,
    });

    expect(mocks.readPublishedDocumentModel).toHaveBeenCalledTimes(3);
  });
});

describe("tutorial list responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readStoredLearningState.mockResolvedValue(null);
    mocks.validateDocumentModel.mockImplementation((value) => value);
  });

  it("includes partial availability and learning progress", async () => {
    const storedTutorial = {
      ...tutorial(
        "00000000-0000-4000-8000-000000000009",
        "processing",
        2,
      ),
      sourcePageCount: 3,
    };
    const storedModel = model(storedTutorial.id, "Progress model");
    const learningState: LearningState = {
      tutorialId: storedTutorial.id,
      updatedAt: "2026-08-05T11:30:00.000Z",
      resume: null,
      concepts: {
        "concept:one": {
          conceptId: "concept:one",
          status: "reviewing",
          lastChunkId: "chunk:one",
          lastAttemptAt: "2026-08-05T11:30:00.000Z",
          nextReviewAt: "2026-08-05T11:45:00.000Z",
          consecutiveCorrect: 1,
          lastResult: "correct",
          lastConfidence: 3,
          misconception: null,
        },
      },
      sessions: [],
    };

    mocks.listStoredTutorials.mockResolvedValue([storedTutorial]);
    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readPublishedDocumentModel.mockResolvedValue(storedModel);
    mocks.readStoredLearningState.mockResolvedValue(learningState);

    await expect(
      listTutorials(new Date("2026-08-05T12:00:00.000Z")),
    ).resolves.toMatchObject([
      {
        id: storedTutorial.id,
        sourcePageCount: 3,
        availability: { batchCount: 2, pageCount: 1 },
        map: { page_count: 1 },
        learningSummary: {
          practiced: 1,
          total: 1,
          dueNow: 1,
        },
      },
    ]);
  });
});

function tutorial(
  id: string,
  status: StoredTutorial["status"],
  publishedBatchCount: number | null,
): StoredTutorial {
  return {
    id,
    title: "Stored tutorial",
    documentName: "stored.pdf",
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-05T11:00:00.000Z",
    sourcePageCount: 1,
    status,
    error: null,
    publishedBatchCount,
    preparation: {
      phase: status === "ready" ? "complete" : "analyzing",
      batches: [
        {
          batch_index: 1,
          start_page: 1,
          end_page: 1,
          status: status === "ready" ? "complete" : "processing",
        },
      ],
    },
  };
}

function model(documentId: string, title: string): DocumentModel {
  return {
    schema_version: 5,
    document_id: documentId,
    title,
    page_count: 1,
    pages: [
      {
        page_index: 1,
        page_label: "1",
        chunks: [
          {
            id: "chunk:one",
            section_title: "One",
            sources: [
              {
                page_index: 1,
                source_text: "Source text for the first concept.",
                highlight_bounds: [
                  { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
                ],
              },
            ],
            title: "One",
            summary: "Summary for the first concept.",
            concept_ids: ["concept:one"],
          },
        ],
      },
    ],
    concepts: [
      {
        id: "concept:one",
        name: "One",
        definition: "The first concept.",
        occurrences: [
          {
            page_index: 1,
            page_label: "1",
            role: "defined",
            explicitness: "explicit",
            confidence: 1,
          },
        ],
      },
    ],
    connections: [],
  };
}

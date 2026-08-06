import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import type { StoredTutorial } from "@/lib/document-storage";
import type { LearningState } from "@/lib/learning-state";

const mocks = vi.hoisted(() => ({
  hasDocumentEmbeddings: vi.fn(),
  listStoredTutorials: vi.fn(),
  readDocumentModel: vi.fn(),
  readStoredLearningState: vi.fn(),
  readStoredTutorial: vi.fn(),
  updateStoredLearningState: vi.fn(),
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

vi.mock("@/lib/document-storage", () => ({
  hasDocumentEmbeddings: mocks.hasDocumentEmbeddings,
  listStoredTutorials: mocks.listStoredTutorials,
  readDocumentModel: mocks.readDocumentModel,
  readStoredLearningState: mocks.readStoredLearningState,
  readStoredTutorial: mocks.readStoredTutorial,
  updateStoredLearningState: mocks.updateStoredLearningState,
}));

import {
  listTutorials,
  readPreparedTutorial,
} from "@/lib/tutorial";

describe("tutorial learning progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDocumentEmbeddings.mockResolvedValue(true);
    mocks.readStoredLearningState.mockResolvedValue(null);
    mocks.validateDocumentModel.mockImplementation((value) => value);
  });

  it("summarizes valid stored learning progress", async () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000101",
      "2026-08-05T11:00:00.000Z",
    );
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
    mocks.readDocumentModel.mockResolvedValue(storedModel);
    mocks.readStoredLearningState.mockResolvedValue(learningState);

    await expect(listTutorials(now)).resolves.toMatchObject([
      {
        id: storedTutorial.id,
        map: {
          page_count: 1,
          concept_count: 1,
          connection_count: 0,
        },
        learningSummary: {
          practiced: 1,
          total: 1,
          mastered: 0,
          reviewing: 1,
          learning: 0,
          notPracticed: 0,
          dueNow: 1,
        },
      },
    ]);
  });

  it("summarizes missing learning state as no progress", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000102",
      "2026-08-05T11:01:00.000Z",
    );
    const storedModel = model(storedTutorial.id, "Empty progress");

    mocks.listStoredTutorials.mockResolvedValue([storedTutorial]);
    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readDocumentModel.mockResolvedValue(storedModel);

    await expect(listTutorials()).resolves.toMatchObject([
      {
        id: storedTutorial.id,
        learningSummary: {
          practiced: 0,
          total: 1,
          mastered: 0,
          reviewing: 0,
          learning: 0,
          notPracticed: 1,
          dueNow: 0,
        },
      },
    ]);
  });

  it.each([
    {
      name: "cannot be read",
      learningState: new Error("learning state read failed"),
    },
    {
      name: "is invalid",
      learningState: { tutorialId: "wrong-tutorial" },
    },
  ])(
    "keeps the prepared tutorial when learning state $name",
    async ({ learningState }) => {
      const storedTutorial = tutorial(
        "00000000-0000-4000-8000-000000000103",
        "2026-08-05T11:02:00.000Z",
      );
      const storedModel = model(storedTutorial.id, "Fallback progress");
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mocks.listStoredTutorials.mockResolvedValue([storedTutorial]);
      mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
      mocks.readDocumentModel.mockResolvedValue(storedModel);

      if (learningState instanceof Error) {
        mocks.readStoredLearningState.mockRejectedValue(learningState);
      } else {
        mocks.readStoredLearningState.mockResolvedValue(learningState);
      }

      await expect(listTutorials()).resolves.toMatchObject([
        {
          id: storedTutorial.id,
          map: {
            page_count: 1,
            concept_count: 1,
            connection_count: 0,
          },
          learningSummary: null,
        },
      ]);
      expect(consoleError).toHaveBeenCalledWith(
        `Learning progress for stored tutorial ${storedTutorial.id} could not be loaded:`,
        expect.any(Error),
      );

      consoleError.mockRestore();
    },
  );

  it("omits a tutorial when its prepared document fails", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000104",
      "2026-08-05T11:03:00.000Z",
    );
    const preparedError = new Error("prepared document read failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.listStoredTutorials.mockResolvedValue([storedTutorial]);
    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readDocumentModel.mockRejectedValue(preparedError);

    await expect(listTutorials()).resolves.toEqual([]);
    expect(mocks.readStoredLearningState).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      `Stored tutorial ${storedTutorial.id} could not be loaded:`,
      preparedError,
    );

    consoleError.mockRestore();
  });
});

describe("prepared tutorial model cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDocumentEmbeddings.mockResolvedValue(true);
    mocks.readStoredLearningState.mockResolvedValue(null);
    mocks.validateDocumentModel.mockImplementation((value) => value);
  });

  it("shares one model read and validation between concurrent callers", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000001",
      "2026-08-05T10:00:00.000Z",
    );
    let resolveModel: (value: DocumentModel) => void = () => {};
    const storedModel = new Promise<DocumentModel>((resolve) => {
      resolveModel = resolve;
    });

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readDocumentModel.mockReturnValue(storedModel);

    const firstRead = readPreparedTutorial(storedTutorial.id);
    const secondRead = readPreparedTutorial(storedTutorial.id);

    await vi.waitFor(() => {
      expect(mocks.readDocumentModel).toHaveBeenCalledTimes(1);
    });
    resolveModel(model(storedTutorial.id, "Concurrent model"));

    const [first, second] = await Promise.all([firstRead, secondRead]);

    expect(first?.model).toBe(second?.model);
    expect(mocks.readDocumentModel).toHaveBeenCalledTimes(1);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(1);
  });

  it("reuses a validated model across direct and tutorial-list reads", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000002",
      "2026-08-05T10:01:00.000Z",
    );
    const storedModel = model(storedTutorial.id, "Reusable model");

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readDocumentModel.mockResolvedValue(storedModel);
    mocks.listStoredTutorials.mockResolvedValue([storedTutorial]);

    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toMatchObject({ model: storedModel });
    await expect(listTutorials()).resolves.toMatchObject([
      {
        id: storedTutorial.id,
        map: {
          page_count: 1,
          concept_count: 1,
          connection_count: 0,
        },
      },
    ]);

    expect(mocks.readStoredTutorial).toHaveBeenCalledTimes(2);
    expect(mocks.hasDocumentEmbeddings).toHaveBeenCalledTimes(2);
    expect(mocks.readDocumentModel).toHaveBeenCalledTimes(1);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(1);
  });

  it("reads and validates a fresh model when updatedAt changes", async () => {
    const tutorialId = "00000000-0000-4000-8000-000000000003";
    const firstTutorial = tutorial(
      tutorialId,
      "2026-08-05T10:02:00.000Z",
    );
    const secondTutorial = tutorial(
      tutorialId,
      "2026-08-05T10:03:00.000Z",
    );
    const firstModel = model(tutorialId, "First model");
    const secondModel = model(tutorialId, "Second model");

    mocks.readStoredTutorial
      .mockResolvedValueOnce(firstTutorial)
      .mockResolvedValueOnce(secondTutorial);
    mocks.readDocumentModel
      .mockResolvedValueOnce(firstModel)
      .mockResolvedValueOnce(secondModel);

    await expect(readPreparedTutorial(tutorialId)).resolves.toMatchObject({
      model: firstModel,
    });
    await expect(readPreparedTutorial(tutorialId)).resolves.toMatchObject({
      model: secondModel,
    });

    expect(mocks.readDocumentModel).toHaveBeenCalledTimes(2);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(2);
  });

  it("retries after a model read rejects", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000004",
      "2026-08-05T10:04:00.000Z",
    );
    const storedModel = model(storedTutorial.id, "Retried model");

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readDocumentModel
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce(storedModel);

    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).rejects.toThrow("read failed");
    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toMatchObject({ model: storedModel });

    expect(mocks.readDocumentModel).toHaveBeenCalledTimes(2);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(1);
  });

  it("retries after model validation rejects", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000005",
      "2026-08-05T10:05:00.000Z",
    );
    const storedModel = model(storedTutorial.id, "Retried validation");

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readDocumentModel.mockResolvedValue(storedModel);
    mocks.validateDocumentModel
      .mockImplementationOnce(() => {
        throw new Error("validation failed");
      })
      .mockImplementationOnce((value) => value);

    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).rejects.toThrow("validation failed");
    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toMatchObject({ model: storedModel });

    expect(mocks.readDocumentModel).toHaveBeenCalledTimes(2);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(2);
  });

  it("does not retain a missing model as a cache hit", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000006",
      "2026-08-05T10:06:00.000Z",
    );
    const storedModel = model(storedTutorial.id, "Completed model");

    mocks.readStoredTutorial.mockResolvedValue(storedTutorial);
    mocks.readDocumentModel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedModel);

    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toBeNull();
    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toMatchObject({ model: storedModel });

    expect(mocks.readDocumentModel).toHaveBeenCalledTimes(2);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(1);
  });

  it("does not serve a cached model when current availability is lost", async () => {
    const storedTutorial = tutorial(
      "00000000-0000-4000-8000-000000000007",
      "2026-08-05T10:07:00.000Z",
    );
    const processingTutorial: StoredTutorial = {
      ...storedTutorial,
      status: "processing",
    };
    const storedModel = model(storedTutorial.id, "Unavailable model");

    mocks.readStoredTutorial
      .mockResolvedValueOnce(storedTutorial)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(processingTutorial)
      .mockResolvedValueOnce(storedTutorial);
    mocks.readDocumentModel.mockResolvedValue(storedModel);
    mocks.hasDocumentEmbeddings
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toMatchObject({ model: storedModel });
    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toBeNull();
    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toBeNull();
    await expect(
      readPreparedTutorial(storedTutorial.id),
    ).resolves.toBeNull();

    expect(mocks.readStoredTutorial).toHaveBeenCalledTimes(4);
    expect(mocks.hasDocumentEmbeddings).toHaveBeenCalledTimes(4);
    expect(mocks.readDocumentModel).toHaveBeenCalledTimes(1);
    expect(mocks.validateDocumentModel).toHaveBeenCalledTimes(1);
  });
});

function tutorial(id: string, updatedAt: string): StoredTutorial {
  return {
    id,
    title: "Stored tutorial",
    documentName: "stored.pdf",
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt,
    sourcePageCount: 1,
    status: "ready",
    error: null,
  };
}

function model(documentId: string, title: string): DocumentModel {
  return {
    schema_version: 4,
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
            source_text: "Source text for the first concept.",
            highlight_bounds: [
              { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
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

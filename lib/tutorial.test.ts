import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import type { StoredTutorial } from "@/lib/document-storage";

const mocks = vi.hoisted(() => ({
  hasDocumentEmbeddings: vi.fn(),
  listStoredTutorials: vi.fn(),
  readDocumentModel: vi.fn(),
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

vi.mock("@/lib/document-storage", () => ({
  hasDocumentEmbeddings: mocks.hasDocumentEmbeddings,
  listStoredTutorials: mocks.listStoredTutorials,
  readDocumentModel: mocks.readDocumentModel,
  readStoredTutorial: mocks.readStoredTutorial,
}));

import {
  listTutorials,
  readPreparedTutorial,
} from "@/lib/tutorial";

describe("prepared tutorial model cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDocumentEmbeddings.mockResolvedValue(true);
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

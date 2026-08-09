import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import {
  readPublishedDocumentEmbeddings,
  readPublishedDocumentModel,
  writeDocumentEmbeddingBatch,
  writePublishedDocumentModel,
} from "@/lib/document-artifact-storage";
import {
  readStoredGuidedProgress,
  readStoredLearningState,
  updateStoredGuidedProgress,
  updateStoredLearningState,
} from "@/lib/stored-progress";
import {
  listStoredTutorials,
  readStoredTutorial,
} from "@/lib/tutorial-storage";
import { InvalidStoredTutorialError } from "@/lib/document-storage-validation";

const createdTutorialIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdTutorialIds.splice(0).map((tutorialId) =>
      fs.rm(
        path.join(process.cwd(), "data", "tutorials", tutorialId),
        { force: true, recursive: true },
      ),
    ),
  );
  vi.restoreAllMocks();
});

describe("stored tutorial progress", () => {
  it("keeps guided and learning progress in one file", async () => {
    const tutorialId = randomUUID();
    createdTutorialIds.push(tutorialId);
    await fs.mkdir(
      path.join(process.cwd(), "data", "tutorials", tutorialId),
      { recursive: true },
    );

    await Promise.all([
      updateStoredGuidedProgress(tutorialId, () => ({
        cursor: "chunk:p1-introduction",
      })),
      updateStoredLearningState(tutorialId, () => ({
        mastery: 0.5,
      })),
    ]);

    await expect(readStoredGuidedProgress(tutorialId)).resolves.toEqual({
      cursor: "chunk:p1-introduction",
    });
    await expect(readStoredLearningState(tutorialId)).resolves.toEqual({
      mastery: 0.5,
    });

    const tutorialDirectory = path.join(
      process.cwd(),
      "data",
      "tutorials",
      tutorialId,
    );
    await expect(
      fs.readdir(tutorialDirectory),
    ).resolves.toEqual(["progress.json"]);
    await expect(
      fs.readFile(path.join(tutorialDirectory, "progress.json"), "utf8"),
    ).resolves.toSatisfy((value: string) => {
      expect(JSON.parse(value)).toEqual({
        guided: { cursor: "chunk:p1-introduction" },
        learning: { mastery: 0.5 },
      });
      return true;
    });
  });
});

describe("stored tutorial metadata", () => {
  it("rejects metadata with the wrong shape", async () => {
    const tutorialId = randomUUID();
    await writeTutorialMetadata(tutorialId, {
      id: tutorialId,
      title: "Incomplete",
    });

    await expect(readStoredTutorial(tutorialId)).rejects.toBeInstanceOf(
      InvalidStoredTutorialError,
    );
  });

  it.each([
    {
      pageCount: 10,
      batches: [
        {
          batch_index: 1,
          start_page: 1,
          end_page: 10,
          status: "pending",
        },
      ],
    },
    {
      pageCount: 11,
      batches: [
        {
          batch_index: 1,
          start_page: 1,
          end_page: 10,
          status: "pending",
        },
        {
          batch_index: 2,
          start_page: 11,
          end_page: 11,
          status: "pending",
        },
      ],
    },
    {
      pageCount: 21,
      batches: [
        {
          batch_index: 1,
          start_page: 1,
          end_page: 10,
          status: "pending",
        },
        {
          batch_index: 2,
          start_page: 11,
          end_page: 20,
          status: "pending",
        },
        {
          batch_index: 3,
          start_page: 21,
          end_page: 21,
          status: "pending",
        },
      ],
    },
  ])(
    "accepts exact batch ranges for $pageCount pages",
    async ({ pageCount, batches }) => {
      const tutorialId = randomUUID();
      const metadata = {
        ...validTutorial(tutorialId),
        sourcePageCount: pageCount,
        preparation: {
          phase: "analyzing",
          batches,
        },
      };
      await writeTutorialMetadata(tutorialId, metadata);

      await expect(readStoredTutorial(tutorialId)).resolves.toEqual(metadata);
    },
  );

  it.each([
    {
      name: "missing final batch",
      batches: [
        {
          batch_index: 1,
          start_page: 1,
          end_page: 10,
          status: "pending",
        },
      ],
    },
    {
      name: "overlong final batch",
      batches: [
        {
          batch_index: 1,
          start_page: 1,
          end_page: 10,
          status: "pending",
        },
        {
          batch_index: 2,
          start_page: 11,
          end_page: 20,
          status: "pending",
        },
      ],
    },
  ])("rejects $name", async ({ batches }) => {
    const tutorialId = randomUUID();
    await writeTutorialMetadata(tutorialId, {
      ...validTutorial(tutorialId),
      sourcePageCount: 11,
      preparation: {
        phase: "analyzing",
        batches,
      },
    });

    await expect(readStoredTutorial(tutorialId)).rejects.toBeInstanceOf(
      InvalidStoredTutorialError,
    );
  });

  it("rejects an untrusted page count without proportional work", async () => {
    const tutorialId = randomUUID();
    await writeTutorialMetadata(tutorialId, {
      ...validTutorial(tutorialId),
      sourcePageCount: Number.MAX_SAFE_INTEGER,
      preparation: {
        phase: "analyzing",
        batches: [],
      },
    });

    await expect(readStoredTutorial(tutorialId)).rejects.toBeInstanceOf(
      InvalidStoredTutorialError,
    );
  });

  it("lists valid tutorials while skipping malformed metadata", async () => {
    const validTutorialId = randomUUID();
    const malformedJsonTutorialId = randomUUID();
    const invalidMetadataTutorialId = randomUUID();
    await Promise.all([
      writeTutorialMetadata(validTutorialId, validTutorial(validTutorialId)),
      writeTutorialMetadata(malformedJsonTutorialId, "{not valid JSON"),
      writeTutorialMetadata(invalidMetadataTutorialId, {
        ...validTutorial(invalidMetadataTutorialId),
        preparation: { phase: "analyzing", batches: [] },
      }),
    ]);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const tutorials = await listStoredTutorials();

    expect(tutorials.find(({ id }) => id === validTutorialId)).toEqual(
      validTutorial(validTutorialId),
    );
    expect(
      tutorials.some(
        ({ id }) =>
          id === malformedJsonTutorialId || id === invalidMetadataTutorialId,
      ),
    ).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      `Stored tutorial ${malformedJsonTutorialId} could not be loaded:`,
      expect.any(SyntaxError),
    );
    expect(consoleError).toHaveBeenCalledWith(
      `Stored tutorial ${invalidMetadataTutorialId} could not be loaded:`,
      expect.any(InvalidStoredTutorialError),
    );
  });

  it("propagates operational metadata read failures", async () => {
    const tutorialId = randomUUID();
    await writeTutorialMetadata(tutorialId, validTutorial(tutorialId));
    const storageError = Object.assign(new Error("Storage read failed"), {
      code: "EIO",
    });
    vi.spyOn(fs, "readFile").mockRejectedValue(storageError);

    await expect(listStoredTutorials()).rejects.toBe(storageError);
  });
});

describe("published document artifacts", () => {
  it("keeps document model snapshots immutable by published batch count", async () => {
    const tutorialId = randomUUID();
    createdTutorialIds.push(tutorialId);
    const model = { page_count: 10 };

    await writePublishedDocumentModel(tutorialId, 1, model as DocumentModel);

    await expect(
      readPublishedDocumentModel(tutorialId, 1),
    ).resolves.toEqual(model);
    await expect(
      writePublishedDocumentModel(tutorialId, 1, model as DocumentModel),
    ).resolves.toBeUndefined();
    await expect(
      writePublishedDocumentModel(
        tutorialId,
        1,
        { page_count: 20 } as DocumentModel,
      ),
    ).rejects.toThrow("published document model already exists");
    await expect(
      readPublishedDocumentModel(tutorialId, 1),
    ).resolves.toEqual(model);
  });

  it("reads only embedding batches inside the published prefix", async () => {
    const tutorialId = randomUUID();
    createdTutorialIds.push(tutorialId);
    const first = {
      schema_version: 1,
      document_id: tutorialId,
      deployment: "embeddings",
      dimensions: 2,
      chunks: [{ chunk_id: "chunk:first", embedding: [1, 0] }],
    };
    const second = {
      ...first,
      chunks: [{ chunk_id: "chunk:second", embedding: [0, 1] }],
    };

    await writeDocumentEmbeddingBatch(tutorialId, 1, first);
    await writeDocumentEmbeddingBatch(tutorialId, 2, second);

    await expect(
      readPublishedDocumentEmbeddings(tutorialId, 1),
    ).resolves.toEqual({
      ...first,
      chunks: first.chunks,
    });
    await expect(
      readPublishedDocumentEmbeddings(tutorialId, 2),
    ).resolves.toEqual({
      ...first,
      chunks: [...first.chunks, ...second.chunks],
    });
    await expect(
      readPublishedDocumentEmbeddings(tutorialId, 3),
    ).resolves.toBeNull();
  });
});

async function writeTutorialMetadata(
  tutorialId: string,
  value: unknown,
) {
  createdTutorialIds.push(tutorialId);
  const directory = path.join(
    process.cwd(),
    "data",
    "tutorials",
    tutorialId,
  );
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "tutorial.json"),
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

function validTutorial(tutorialId: string) {
  return {
    id: tutorialId,
    title: "Valid tutorial",
    documentName: "valid.pdf",
    createdAt: "2026-08-08T12:00:00.000Z",
    updatedAt: "2026-08-08T12:00:00.000Z",
    sourcePageCount: 1,
    publishedBatchCount: null,
    status: "queued",
    error: null,
    preparation: {
      phase: "analyzing",
      batches: [
        {
          batch_index: 1,
          start_page: 1,
          end_page: 1,
          status: "pending",
        },
      ],
    },
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateDocumentEmbeddingBatches,
  generateDocumentEmbeddings,
} from "@/lib/document-embedding-generation";
import { model } from "@/lib/document-embedding-test-fixtures";
import type { DocumentModel } from "@/lib/document-model";

describe("document embedding generation", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://azure.example");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "api-key");
    vi.stubEnv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "embeddings");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds document embeddings from normalized vectors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json({
            data: [{ index: 0, embedding: [3, 4] }],
          }),
        ),
      ),
    );

    await expect(generateDocumentEmbeddings(model)).resolves.toEqual({
      schema_version: 1,
      document_id: "document-id",
      deployment: "embeddings",
      dimensions: 2,
      chunks: [
        {
          chunk_id: "chunk:first",
          embedding: [0.6, 0.8],
        },
      ],
    });
  });

  it("does not repeat a successful request when a later batch retries", async () => {
    vi.useFakeTimers();
    const baseChunk = model.pages[0].chunks[0];
    const baseSource = baseChunk.sources[0];
    const batchedModel: DocumentModel = {
      ...model,
      pages: [
        {
          ...model.pages[0],
          chunks: Array.from({ length: 101 }, (_, index) => ({
            ...baseChunk,
            id: `chunk:${index}`,
            title: `Chunk ${index}`,
            sources: [
              {
                ...baseSource,
                source_text: `Source ${index}`,
              },
            ],
          })),
        },
      ],
    };
    const requestInputs: string[][] = [];
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (typeof init?.body !== "string") {
        throw new Error("Expected an embedding request body.");
      }

      const body = JSON.parse(init.body) as { input: string[] };
      requestInputs.push(body.input);

      if (requestInputs.length === 2) {
        return Promise.resolve(
          new Response("Service unavailable", { status: 503 }),
        );
      }

      return Promise.resolve(
        Response.json({
          data: body.input.map((_, index) => ({
            index,
            embedding: [1, 0],
          })),
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = generateDocumentEmbeddings(batchedModel);
    await vi.advanceTimersByTimeAsync(1000);
    await request;

    expect(requestInputs).toHaveLength(3);
    expect(requestInputs[0]).toHaveLength(100);
    expect(requestInputs[1]).toHaveLength(1);
    expect(requestInputs[2]).toEqual(requestInputs[1]);
  });

  it("keeps generated embedding vectors in input order", async () => {
    const firstChunk = model.pages[0].chunks[0];
    const orderedModel: DocumentModel = {
      ...model,
      pages: [
        {
          ...model.pages[0],
          chunks: [
            firstChunk,
            {
              ...firstChunk,
              id: "chunk:second",
              title: "Second",
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json({
            data: [
              { index: 1, embedding: [0, 2] },
              { index: 0, embedding: [3, 0] },
            ],
          }),
        ),
      ),
    );

    const result = await generateDocumentEmbeddings(orderedModel);

    expect(result.chunks).toEqual([
      { chunk_id: "chunk:first", embedding: [1, 0] },
      { chunk_id: "chunk:second", embedding: [0, 1] },
    ]);
  });

  it("coalesces document ranges and partitions their embeddings", async () => {
    const chunksPerPage = 40;
    const baseChunk = model.pages[0].chunks[0];
    const baseSource = baseChunk.sources[0];
    const batchedModel: DocumentModel = {
      ...model,
      page_count: 3,
      pages: Array.from({ length: 3 }, (_, pageOffset) => {
        const pageIndex = pageOffset + 1;

        return {
          page_index: pageIndex,
          page_label: String(pageIndex),
          chunks: Array.from({ length: chunksPerPage }, (_, chunkOffset) => {
            const chunkNumber = pageOffset * chunksPerPage + chunkOffset + 1;

            return {
              ...baseChunk,
              id: `chunk:${chunkNumber}`,
              title: `Chunk ${chunkNumber}`,
              sources: [
                {
                  ...baseSource,
                  page_index: 1,
                  source_text: `Source ${chunkNumber}`,
                },
              ],
            };
          }),
        };
      }),
    };
    const requestBodies: Array<{ input: string[]; model: string }> = [];
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (typeof init?.body !== "string") {
        throw new Error("Expected an embedding request body.");
      }

      const body = JSON.parse(init.body) as {
        input: string[];
        model: string;
      };
      requestBodies.push(body);
      const data = body.input.map((input, index) => {
        const match = /Chunk (\d+)/.exec(input);

        if (!match) {
          throw new Error("Expected a numbered chunk input.");
        }

        return {
          index,
          embedding: [Number(match[1]), 1],
        };
      });

      return Promise.resolve(Response.json({ data }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const batchRanges = [
      { batch_index: 8, start_page: 2, end_page: 2 },
      { batch_index: 3, start_page: 1, end_page: 1 },
      { batch_index: 12, start_page: 3, end_page: 3 },
    ];

    const result = await generateDocumentEmbeddingBatches(
      batchedModel,
      batchRanges,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodies.map(({ input }) => input.length)).toEqual([100, 20]);
    expect(requestBodies.map(({ model: deployment }) => deployment)).toEqual([
      "embeddings",
      "embeddings",
    ]);
    expect(result.map(({ batch_index }) => batch_index)).toEqual([8, 3, 12]);
    expect(
      result.map(({ embeddings }) => ({
        deployment: embeddings.deployment,
        dimensions: embeddings.dimensions,
      })),
    ).toEqual([
      { deployment: "embeddings", dimensions: 2 },
      { deployment: "embeddings", dimensions: 2 },
      { deployment: "embeddings", dimensions: 2 },
    ]);
    expect(
      result.map(({ embeddings }) =>
        embeddings.chunks.map(({ chunk_id }) => chunk_id),
      ),
    ).toEqual([
      Array.from({ length: 40 }, (_, index) => `chunk:${index + 41}`),
      Array.from({ length: 40 }, (_, index) => `chunk:${index + 1}`),
      Array.from({ length: 40 }, (_, index) => `chunk:${index + 81}`),
    ]);

    const embeddedChunks = result.flatMap(({ embeddings }) => embeddings.chunks);
    expect(new Set(embeddedChunks.map(({ chunk_id }) => chunk_id)).size).toBe(
      120,
    );
    for (const { chunk_id, embedding } of embeddedChunks) {
      const chunkNumber = Number(chunk_id.slice("chunk:".length));
      const magnitude = Math.sqrt(chunkNumber * chunkNumber + 1);

      expect(embedding).toEqual([
        chunkNumber / magnitude,
        1 / magnitude,
      ]);
    }
  });

});

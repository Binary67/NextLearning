import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RetryableAzureOpenAIError } from "@/lib/azure-openai-generation-retry";
import {
  type DocumentEmbeddings,
  findHybridDocumentTopics,
  findTextSelectionContext,
  generateDocumentEmbeddingBatches,
  generateDocumentEmbeddings,
} from "@/lib/document-embeddings";
import type { DocumentModel } from "@/lib/document-model";

const model: DocumentModel = {
  schema_version: 5,
  document_id: "document-id",
  title: "Document",
  page_count: 1,
  pages: [
    {
      page_index: 1,
      page_label: "1",
      chunks: [
        {
          id: "chunk:first",
          section_title: "Section",
          sources: [
            {
              page_index: 1,
              source_text: "Source text",
              highlight_bounds: [
                { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
              ],
            },
          ],
          title: "First",
          summary: "Summary",
          concept_ids: [],
        },
      ],
    },
  ],
  concepts: [],
  connections: [],
};

const documentEmbeddings: DocumentEmbeddings = {
  schema_version: 1,
  document_id: "document-id",
  deployment: "embeddings",
  dimensions: 2,
  chunks: [{ chunk_id: "chunk:first", embedding: [1, 0] }],
};

describe("document embeddings", () => {
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

  it("retries a non-JSON 5xx per request up to the bounded limit", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response("<html>Service unavailable</html>", {
          status: 503,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = generateDocumentEmbeddings(model);
    const rejection = expect(request).rejects.toBeInstanceOf(
      RetryableAzureOpenAIError,
    );
    await vi.advanceTimersByTimeAsync(7_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("aborts embedding requests after 30 seconds", async () => {
    const timeoutController = new AbortController();
    const timeoutError = new DOMException(
      "The operation timed out.",
      "TimeoutError",
    );
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutController.signal);
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = generateDocumentEmbeddings(model);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(timeout).toHaveBeenCalledWith(30 * 1000);

    timeoutController.abort(timeoutError);

    await expect(request).rejects.toBe(timeoutError);
  });

  it("composes caller cancellation with the embedding timeout", async () => {
    const callerController = new AbortController();
    const cancellationError = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = findTextSelectionContext(
      model,
      documentEmbeddings,
      1,
      "selected text",
      callerController.signal,
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const requestSignal = fetchMock.mock.calls[0][1]?.signal;
    expect(requestSignal).not.toBe(callerController.signal);

    callerController.abort(cancellationError);

    await expect(request).rejects.toBe(cancellationError);
  });

  it("keeps successful embedding parsing unchanged", async () => {
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

  it("does not retry 400 responses, invalid response data, or invalid vectors", async () => {
    const cases = [
      new Response("Bad request", { status: 400 }),
      Response.json({ data: [{ index: 0 }] }),
      Response.json({ data: [{ index: 0, embedding: [0, 0] }] }),
    ];

    for (const response of cases) {
      const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
      vi.stubGlobal("fetch", fetchMock);

      await expect(generateDocumentEmbeddings(model)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  });

  it("does not retry a transient response after caller cancellation", async () => {
    const controller = new AbortController();
    const cancellation = new DOMException("Cancelled", "AbortError");
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("Service unavailable", { status: 503 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = findTextSelectionContext(
      model,
      documentEmbeddings,
      1,
      "selected text",
      controller.signal,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort(cancellation);

    await expect(request).rejects.toBe(cancellation);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps embedding vectors in input order", async () => {
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

  it("matches a carried paragraph from its previous source page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json({
            data: [{ index: 0, embedding: [1, 0] }],
          }),
        ),
      ),
    );
    const carriedModel: DocumentModel = {
      ...model,
      page_count: 2,
      pages: [
        {
          page_index: 1,
          page_label: "1",
          chunks: [],
        },
        {
          page_index: 2,
          page_label: "2",
          chunks: [
            {
              ...model.pages[0].chunks[0],
              sources: [
                {
                  page_index: 1,
                  source_text: "A paragraph begins on page one",
                  highlight_bounds: [
                    { x: 0.1, y: 0.8, width: 0.5, height: 0.05 },
                  ],
                },
                {
                  page_index: 2,
                  source_text: "and concludes on page two.",
                  highlight_bounds: [
                    { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    await expect(
      findTextSelectionContext(
        carriedModel,
        documentEmbeddings,
        1,
        "A paragraph begins on page one",
      ),
    ).resolves.toMatchObject({
      selected_chunk: { id: "chunk:first" },
    });
  });
  it("reuses its search index and keeps five deterministic page matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json({
            data: [{ index: 0, embedding: [1, 0] }],
          }),
        ),
      ),
    );
    const similarities = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
    const baseChunk = model.pages[0].chunks[0];
    const pages = similarities.map((similarity, index) => {
      const pageIndex = index + 1;
      const chunks = [
        {
          ...baseChunk,
          id: `chunk:${pageIndex}`,
          title: `Page ${pageIndex}`,
          sources: [
            {
              ...baseChunk.sources[0],
              page_index: pageIndex,
            },
          ],
        },
      ];

      if (pageIndex === 1) {
        chunks.push({
          ...chunks[0],
          id: "chunk:0",
          title: "Deterministic winner",
        });
      }

      return {
        page_index: pageIndex,
        page_label: String(pageIndex),
        chunks,
      };
    });
    let pageReads = 0;
    const indexedModel: DocumentModel = {
      ...model,
      page_count: pages.length,
      get pages() {
        pageReads += 1;
        return pages;
      },
    };
    const indexedEmbeddings: DocumentEmbeddings = {
      ...documentEmbeddings,
      chunks: pages.flatMap((page, index) => {
        const similarity = similarities[index];
        const embedding = [
          similarity,
          Math.sqrt(1 - similarity * similarity),
        ];
        return page.chunks.map((chunk) => ({
          chunk_id: chunk.id,
          embedding,
        }));
      }),
    };

    const firstMatches = await findHybridDocumentTopics(
      indexedModel,
      indexedEmbeddings,
      "unmatched query",
    );
    const pageReadsAfterFirstSearch = pageReads;
    const secondMatches = await findHybridDocumentTopics(
      indexedModel,
      indexedEmbeddings,
      "unmatched query",
    );

    expect(firstMatches.map(({ page_index }) => page_index)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(firstMatches[0].title).toBe("Deterministic winner");
    expect(secondMatches).toEqual(firstMatches);
    expect(pageReads).toBe(pageReadsAfterFirstSearch);
  });

});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findHybridDocumentTopics,
  findTextSelectionContext,
} from "@/lib/document-search";
import {
  documentEmbeddings,
  model,
} from "@/lib/document-embedding-test-fixtures";
import type { DocumentEmbeddings } from "@/lib/document-embedding-types";
import type { DocumentModel } from "@/lib/document-model";

describe("document search", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://azure.example");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "api-key");
    vi.stubEnv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "embeddings");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

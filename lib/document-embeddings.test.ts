import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RetryableAzureOpenAIError } from "@/lib/azure-openai-generation-retry";
import {
  type DocumentEmbeddings,
  findTextSelectionContext,
  generateDocumentEmbeddings,
} from "@/lib/document-embeddings";
import type { DocumentModel } from "@/lib/document-model";

const model: DocumentModel = {
  schema_version: 4,
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
          source_text: "Source text",
          highlight_bounds: [
            { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
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
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("classifies a non-JSON 5xx as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response("<html>Service unavailable</html>", {
            status: 503,
          }),
        ),
      ),
    );

    await expect(generateDocumentEmbeddings(model)).rejects.toBeInstanceOf(
      RetryableAzureOpenAIError,
    );
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
});

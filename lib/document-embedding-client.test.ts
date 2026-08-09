import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RetryableAzureOpenAIError } from "@/lib/azure-openai-generation-retry";
import { requestEmbeddings } from "@/lib/document-embedding-client";

describe("document embedding client", () => {
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

    const request = requestEmbeddings(["Source text"]);
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

    const request = requestEmbeddings(["Source text"]);

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

    const request = requestEmbeddings(
      ["Source text"],
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

    await expect(requestEmbeddings(["Source text"])).resolves.toEqual({
      deployment: "embeddings",
      embeddings: [[0.6, 0.8]],
    });
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

      await expect(requestEmbeddings(["Source text"])).rejects.toThrow();
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

    const request = requestEmbeddings(["Source text"], controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort(cancellation);

    await expect(request).rejects.toBe(cancellation);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps embedding vectors in input order", async () => {
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

    await expect(
      requestEmbeddings(["First", "Second"]),
    ).resolves.toMatchObject({
      embeddings: [
        [1, 0],
        [0, 1],
      ],
    });
  });

});

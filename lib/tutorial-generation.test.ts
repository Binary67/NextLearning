import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDocumentModel } from "@/lib/tutorial-generation";

describe("generateDocumentModel", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://azure.example");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "api-key");
    vi.stubEnv("AZURE_OPENAI_FLAGSHIP_DEPLOYMENT", "flagship");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("aborts generation requests after five minutes", async () => {
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

    const request = generateDocumentModel(
      Buffer.from("pdf"),
      "document.pdf",
      "document-id",
      1,
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(timeout).toHaveBeenCalledWith(5 * 60 * 1000);

    timeoutController.abort(timeoutError);

    await expect(request).rejects.toBe(timeoutError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

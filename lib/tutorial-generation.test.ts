import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDocumentBatch } from "@/lib/tutorial-generation";

describe("generateDocumentBatch", () => {
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

  it("aborts generation requests after fifteen minutes", async () => {
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

    const request = generateDocumentBatch(
      Buffer.from("pdf"),
      "document.pdf",
      "document-id",
      1,
      1,
      1,
      1,
      1,
      1,
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(timeout).toHaveBeenCalledWith(15 * 60 * 1000);
    const requestBody = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    );
    const prompt = requestBody.input[0].content[1].text as string;
    const chunkSchema =
      requestBody.text.format.schema.properties.pages.items.properties
        .chunks;
    expect(prompt).toContain(
      "Normally give each substantive page one chunk",
    );
    expect(prompt).toContain(
      "Multiple sources may use the same page",
    );
    expect(prompt).toContain(
      "Assign the complete paragraph to the next page's chunk",
    );
    expect(prompt).toContain(
      "previous-page fragment followed by the owning-page fragment",
    );
    expect(chunkSchema.description).toContain("At most three");
    expect(
      chunkSchema.items.properties.sources.description,
    ).toContain("One to four");
    expect(
      chunkSchema.items.properties.concept_ids.description,
    ).toContain("One to twelve");

    timeoutController.abort(timeoutError);

    await expect(request).rejects.toBe(timeoutError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findTextSelectionContext: vi.fn(),
  readDocumentEmbeddings: vi.fn(),
  readPreparedTutorial: vi.fn(),
  validateDocumentEmbeddings: vi.fn(),
}));

vi.mock("@/lib/document-embeddings", () => ({
  findTextSelectionContext: mocks.findTextSelectionContext,
  validateDocumentEmbeddings: mocks.validateDocumentEmbeddings,
}));

vi.mock("@/lib/document-storage", () => ({
  isTutorialId: () => true,
  readDocumentEmbeddings: mocks.readDocumentEmbeddings,
}));

vi.mock("@/lib/request-body-size", () => {
  class RequestBodyTooLargeError extends Error {}

  return {
    RequestBodyTooLargeError,
    async readRequestTextWithLimit(request: Request, maxBytes: number) {
      const requestText = await request.text();

      if (new TextEncoder().encode(requestText).byteLength > maxBytes) {
        throw new RequestBodyTooLargeError();
      }

      return requestText;
    },
  };
});

vi.mock("@/lib/tutorial", () => ({
  readPreparedTutorial: mocks.readPreparedTutorial,
}));

import { POST } from "@/app/api/tutorials/[tutorialId]/related-pages/route";

const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};
const model = {
  page_count: 2,
};
const embeddings = {};

describe("related-pages route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readPreparedTutorial.mockResolvedValue({ model });
    mocks.readDocumentEmbeddings.mockResolvedValue(embeddings);
    mocks.validateDocumentEmbeddings.mockReturnValue(embeddings);
    mocks.findTextSelectionContext.mockResolvedValue(null);
  });

  it("rejects a body over 64 KiB before parsing JSON", async () => {
    const request = createRequest("x".repeat(64 * 1024 + 1));

    const response = await POST(request, routeContext);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: "The related-page request is too large.",
    });
    expect(mocks.readPreparedTutorial).not.toHaveBeenCalled();
  });

  it("passes the incoming request signal to related-page matching", async () => {
    const request = createRequest(
      JSON.stringify({
        page_index: 1,
        selection_text: " Selected text ",
      }),
    );

    const response = await POST(request, routeContext);

    expect(response.status).toBe(200);
    expect(mocks.findTextSelectionContext).toHaveBeenCalledWith(
      model,
      embeddings,
      1,
      "Selected text",
      request.signal,
    );
  });

  it("does not log or convert incoming-request cancellation", async () => {
    const controller = new AbortController();
    const request = createRequest(
      JSON.stringify({
        page_index: 1,
        selection_text: "Selected text",
      }),
      controller.signal,
    );
    const cancellation = new DOMException(
      "The request was aborted.",
      "AbortError",
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.findTextSelectionContext.mockImplementation(async () => {
      controller.abort();
      throw cancellation;
    });

    await expect(POST(request, routeContext)).rejects.toBe(cancellation);
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

function createRequest(body: string, signal?: AbortSignal) {
  return new Request(
    `http://localhost/api/tutorials/${tutorialId}/related-pages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal,
    },
  );
}

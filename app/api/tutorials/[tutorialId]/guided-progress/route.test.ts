import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readPreparedTutorial: vi.fn(),
  recordGuidedProgressEvent: vi.fn(),
  resetGuidedProgress: vi.fn(),
}));

vi.mock("@/lib/document-storage", () => ({
  isTutorialId: () => true,
}));

vi.mock("@/lib/guided-progress-store", () => ({
  readGuidedProgress: vi.fn(),
  recordGuidedProgressEvent: mocks.recordGuidedProgressEvent,
  resetGuidedProgress: mocks.resetGuidedProgress,
}));

vi.mock("@/lib/tutorial", () => ({
  readPreparedTutorial: mocks.readPreparedTutorial,
}));

import {
  DELETE,
  POST,
} from "@/app/api/tutorials/[tutorialId]/guided-progress/route";

const maxBytes = 100 * 1024;
const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};

describe("guided-progress route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readPreparedTutorial.mockResolvedValue({ model: {} });
    mocks.recordGuidedProgressEvent.mockResolvedValue({});
    mocks.resetGuidedProgress.mockResolvedValue({
      cursor: null,
      completedChunkIds: [],
    });
  });

  it("accepts a valid event exactly at the 100 KiB limit", async () => {
    const body = createExactSizeJson(
      { type: "empty_page_completed", pageIndex: 0 },
      maxBytes,
    );

    const response = await POST(createRequest(body), routeContext);

    expect(response.status).toBe(200);
    expect(mocks.recordGuidedProgressEvent).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-number"],
    ["understated", "1"],
  ])(
    "rejects a body over 100 KiB with %s Content-Length",
    async (_description, contentLength) => {
      const response = await POST(
        createRequest("x".repeat(maxBytes + 1), contentLength),
        routeContext,
      );

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toEqual({
        message: "The guided-progress event is too large.",
      });
      expect(mocks.recordGuidedProgressEvent).not.toHaveBeenCalled();
    },
  );

  it("preserves the existing malformed JSON response", async () => {
    const response = await POST(createRequest("{"), routeContext);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "A valid guided-reading progress event is required.",
    });
  });

  it("resets guided progress", async () => {
    const response = await DELETE(
      new Request(
        `http://localhost/api/tutorials/${tutorialId}/guided-progress`,
        { method: "DELETE" },
      ),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.resetGuidedProgress).toHaveBeenCalledWith(tutorialId);
    await expect(response.json()).resolves.toEqual({
      guidedProgress: {
        cursor: null,
        completedChunkIds: [],
      },
    });
  });
});

function createExactSizeJson(
  value: Record<string, unknown>,
  byteLength: number,
) {
  const emptyBody = JSON.stringify({ ...value, padding: "" });
  const paddingLength =
    byteLength - new TextEncoder().encode(emptyBody).byteLength;
  const body = JSON.stringify({
    ...value,
    padding: "x".repeat(paddingLength),
  });

  expect(new TextEncoder().encode(body).byteLength).toBe(byteLength);
  return body;
}

function createRequest(body: string, contentLength?: string) {
  return new Request(
    `http://localhost/api/tutorials/${tutorialId}/guided-progress`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(contentLength === undefined
          ? {}
          : { "Content-Length": contentLength }),
      },
      body,
    },
  );
}

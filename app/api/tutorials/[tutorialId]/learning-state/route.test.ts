import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutateLearningState: vi.fn(),
  parseResumeInput: vi.fn(),
  readPreparedTutorial: vi.fn(),
}));

vi.mock("@/lib/document-storage", () => ({
  isTutorialId: () => true,
}));

vi.mock("@/lib/learning-state", () => ({
  LearningStateConflictError: class extends Error {},
  LearningStateInputError: class extends Error {},
  parseResumeInput: mocks.parseResumeInput,
  updateResume: vi.fn(),
  validateResumeReferences: vi.fn(),
}));

vi.mock("@/lib/learning-state-store", () => ({
  mutateLearningState: mocks.mutateLearningState,
  readLearningState: vi.fn(),
}));

vi.mock("@/lib/tutorial", () => ({
  readPreparedTutorial: mocks.readPreparedTutorial,
}));

import { PATCH } from "@/app/api/tutorials/[tutorialId]/learning-state/route";

const maxBytes = 100 * 1024;
const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};

describe("learning-state route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readPreparedTutorial.mockResolvedValue({ model: {} });
    mocks.parseResumeInput.mockReturnValue({
      pageIndex: 0,
      chunkId: null,
    });
    mocks.mutateLearningState.mockResolvedValue({});
  });

  it("accepts a valid resume update exactly at the 100 KiB limit", async () => {
    const body = createExactSizeJson(
      { resume: { pageIndex: 0, chunkId: null } },
      maxBytes,
    );

    const response = await PATCH(createRequest(body), routeContext);

    expect(response.status).toBe(200);
    expect(mocks.parseResumeInput).toHaveBeenCalledOnce();
    expect(mocks.mutateLearningState).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-number"],
    ["understated", "1"],
  ])(
    "rejects a body over 100 KiB with %s Content-Length",
    async (_description, contentLength) => {
      const response = await PATCH(
        createRequest("x".repeat(maxBytes + 1), contentLength),
        routeContext,
      );

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toEqual({
        message: "The learning-state resume update is too large.",
      });
      expect(mocks.parseResumeInput).not.toHaveBeenCalled();
    },
  );

  it("preserves the existing malformed JSON response", async () => {
    const response = await PATCH(createRequest("{"), routeContext);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "A JSON body is required.",
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
    `http://localhost/api/tutorials/${tutorialId}/learning-state`,
    {
      method: "PATCH",
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

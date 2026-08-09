import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutateLearningState: vi.fn(),
  parseLearningAttemptInput: vi.fn(),
  readAvailableTutorial: vi.fn(),
}));

vi.mock("@/lib/tutorial-storage", () => ({
  isTutorialId: () => true,
}));

vi.mock("@/lib/learning-state", () => ({
  LearningStateConflictError: class extends Error {},
  LearningStateInputError: class extends Error {},
  parseLearningAttemptInput: mocks.parseLearningAttemptInput,
  recordLearningAttempt: vi.fn(),
  validateAttemptReferences: vi.fn(),
}));

vi.mock("@/lib/learning-state-store", () => ({
  mutateLearningState: mocks.mutateLearningState,
}));

vi.mock("@/lib/tutorial", () => ({
  readAvailableTutorial: mocks.readAvailableTutorial,
}));

import { POST } from "@/app/api/tutorials/[tutorialId]/learning-state/attempts/route";

const maxBytes = 100 * 1024;
const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};

describe("learning-attempt route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAvailableTutorial.mockResolvedValue({ model: {} });
    mocks.parseLearningAttemptInput.mockReturnValue({});
    mocks.mutateLearningState.mockResolvedValue({});
  });

  it("accepts a valid attempt exactly at the 100 KiB limit", async () => {
    const body = createExactSizeJson(
      { sessionId: "session-id" },
      maxBytes,
    );

    const response = await POST(createRequest(body), routeContext);

    expect(response.status).toBe(200);
    expect(mocks.parseLearningAttemptInput).toHaveBeenCalledOnce();
    expect(mocks.mutateLearningState).toHaveBeenCalledOnce();
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
        message: "The learning attempt is too large.",
      });
      expect(mocks.parseLearningAttemptInput).not.toHaveBeenCalled();
    },
  );

  it("preserves the existing malformed JSON response", async () => {
    const response = await POST(createRequest("{"), routeContext);

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
    `http://localhost/api/tutorials/${tutorialId}/learning-state/attempts`,
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

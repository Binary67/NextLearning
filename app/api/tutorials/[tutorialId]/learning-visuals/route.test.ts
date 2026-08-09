import { beforeEach, describe, expect, it, vi } from "vitest";

import { MissingAzureOpenAIConfigurationError } from "@/lib/azure-openai-generation-retry";
import {
  LearningVisualInputError,
  MAX_LEARNING_VISUAL_REQUEST_BYTES,
} from "@/lib/learning-visual";

const mocks = vi.hoisted(() => ({
  generateLearningVisual: vi.fn(),
  readAvailableTutorial: vi.fn(),
}));

vi.mock("@/lib/tutorial-storage", () => ({
  isTutorialId: (value: string) => value === "tutorial-id",
}));

vi.mock("@/lib/learning-visual/generation", () => ({
  generateLearningVisual: mocks.generateLearningVisual,
  resolveLearningVisualGrounding: vi.fn(),
}));

vi.mock("@/lib/tutorial", () => ({
  readAvailableTutorial: mocks.readAvailableTutorial,
}));

import { POST } from "@/app/api/tutorials/[tutorialId]/learning-visuals/route";

const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};
const validInput = {
  request: {
    origin: "tutor",
    learnerQuestion: "Why does the signal split?",
    confusionSummary: "The learner is mixing up the paths.",
    learningGoal: "Explain how the paths differ.",
  },
  pageIndex: 2,
  chunkId: "chunk:p2-paths",
  selectionText: null,
  pageImageUrl: "data:image/png;base64,AAAA",
  explanationStyle: "plain",
};
const visual = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Signal split",
  strategy: "process",
  htmlFragment: "<section></section>",
  narrationCues: [
    { id: "split", label: "Signal split", meaning: "The input branches." },
  ],
  altText: "A signal splitting into two paths.",
};

describe("learning-visuals route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAvailableTutorial.mockResolvedValue({ model: {} });
    mocks.generateLearningVisual.mockResolvedValue(visual);
  });

  it("returns a generated visual without storing it", async () => {
    const request = createRequest(JSON.stringify(validInput));

    const response = await POST(request, routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(visual);
    expect(mocks.generateLearningVisual).toHaveBeenCalledWith(
      {},
      validInput,
      request.signal,
    );
  });

  it("returns 400 for invalid input", async () => {
    const response = await POST(
      createRequest(JSON.stringify({ ...validInput, extra: true })),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.readAvailableTutorial).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prepared page or chunk references", async () => {
    mocks.generateLearningVisual.mockRejectedValue(
      new LearningVisualInputError("The requested document chunk is not available on that page."),
    );

    const response = await POST(
      createRequest(JSON.stringify(validInput)),
      routeContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "The requested document chunk is not available on that page.",
    });
  });

  it("returns 404 when the tutorial is unavailable", async () => {
    mocks.readAvailableTutorial.mockResolvedValue(null);

    const response = await POST(
      createRequest(JSON.stringify(validInput)),
      routeContext,
    );

    expect(response.status).toBe(404);
    expect(mocks.generateLearningVisual).not.toHaveBeenCalled();
  });

  it("returns 413 before parsing an oversized request", async () => {
    const response = await POST(
      createRequest("x".repeat(MAX_LEARNING_VISUAL_REQUEST_BYTES + 1)),
      routeContext,
    );

    expect(response.status).toBe(413);
    expect(mocks.readAvailableTutorial).not.toHaveBeenCalled();
  });

  it("returns 503 when Azure generation is not configured", async () => {
    mocks.generateLearningVisual.mockRejectedValue(
      new MissingAzureOpenAIConfigurationError("missing"),
    );

    const response = await POST(
      createRequest(JSON.stringify(validInput)),
      routeContext,
    );

    expect(response.status).toBe(503);
  });

  it("returns 502 when generation or generated-output validation fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.generateLearningVisual.mockRejectedValue(
      new Error("invalid generated fragment"),
    );

    const response = await POST(
      createRequest(JSON.stringify(validInput)),
      routeContext,
    );

    expect(response.status).toBe(502);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

function createRequest(body: string) {
  return new Request(
    `http://localhost/api/tutorials/${tutorialId}/learning-visuals`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );
}

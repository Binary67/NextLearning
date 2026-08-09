import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteStoredTutorial: vi.fn(),
  isTutorialId: vi.fn(),
  readAvailableTutorial: vi.fn(),
  readStoredTutorial: vi.fn(),
  runTutorialQueue: vi.fn(),
  toTutorialResponse: vi.fn(),
  updateStoredTutorial: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/lib/tutorial-storage", () => ({
  deleteStoredTutorial: mocks.deleteStoredTutorial,
  isTutorialId: mocks.isTutorialId,
  readStoredTutorial: mocks.readStoredTutorial,
  updateStoredTutorial: mocks.updateStoredTutorial,
}));

vi.mock("@/lib/tutorial", () => ({
  readAvailableTutorial: mocks.readAvailableTutorial,
  toTutorialResponse: mocks.toTutorialResponse,
}));

vi.mock("@/lib/tutorial-queue", () => ({
  runTutorialQueue: mocks.runTutorialQueue,
}));

import { GET } from "@/app/api/tutorials/[tutorialId]/route";

const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};

describe("tutorial detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the latest available published model", async () => {
    const tutorial = { id: tutorialId, status: "processing" };
    const model = { page_count: 10 };
    mocks.isTutorialId.mockReturnValue(true);
    mocks.readAvailableTutorial.mockResolvedValue({
      tutorial,
      model,
      publishedBatchCount: 2,
    });
    mocks.toTutorialResponse.mockReturnValue({
      id: tutorialId,
      availability: { batchCount: 2, pageCount: 10 },
    });

    const response = await GET(new Request("http://localhost"), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tutorial: {
        id: tutorialId,
        availability: { batchCount: 2, pageCount: 10 },
      },
      model,
    });
    expect(mocks.readAvailableTutorial).toHaveBeenCalledWith(tutorialId);
    expect(mocks.toTutorialResponse).toHaveBeenCalledWith(
      tutorial,
      model,
    );
  });

  it("returns 404 when no published snapshot exists", async () => {
    mocks.isTutorialId.mockReturnValue(true);
    mocks.readAvailableTutorial.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), routeContext);

    expect(response.status).toBe(404);
    expect(mocks.toTutorialResponse).not.toHaveBeenCalled();
  });
});

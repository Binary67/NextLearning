import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTutorialId: vi.fn(),
  readAvailableTutorial: vi.fn(),
}));

vi.mock("@/lib/tutorial-storage", () => ({
  isTutorialId: mocks.isTutorialId,
}));

vi.mock("@/lib/tutorial", () => ({
  readAvailableTutorial: mocks.readAvailableTutorial,
}));

import { POST } from "@/app/api/tutorials/[tutorialId]/realtime/session/route";

const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};

describe("realtime session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTutorialId.mockReturnValue(true);
    mocks.readAvailableTutorial.mockResolvedValue(null);
  });

  it("does not start a session without a published snapshot", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: "offer",
      }),
      routeContext,
    );

    expect(response.status).toBe(404);
    expect(mocks.readAvailableTutorial).toHaveBeenCalledWith(tutorialId);
  });
});

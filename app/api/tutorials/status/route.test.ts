import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  hasActiveTutorials: vi.fn(),
  listStoredTutorials: vi.fn(),
  readAvailableTutorial: vi.fn(),
  runTutorialQueue: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/lib/tutorial-storage", () => ({
  listStoredTutorials: mocks.listStoredTutorials,
}));

vi.mock("@/lib/tutorial-status", () => ({
  hasActiveTutorials: mocks.hasActiveTutorials,
}));

vi.mock("@/lib/tutorial", () => ({
  readAvailableTutorial: mocks.readAvailableTutorial,
}));

vi.mock("@/lib/tutorial-queue", () => ({
  runTutorialQueue: mocks.runTutorialQueue,
}));

import { GET } from "@/app/api/tutorials/status/route";

describe("tutorial status route", () => {
  it("reports each tutorial's published availability", async () => {
    const storedTutorials = [
      {
        id: "queued-id",
        status: "queued",
      },
      {
        id: "processing-id",
        status: "processing",
      },
      {
        id: "failed-id",
        status: "failed",
      },
    ];
    mocks.listStoredTutorials.mockResolvedValue(storedTutorials);
    mocks.readAvailableTutorial
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        publishedBatchCount: 2,
        model: { page_count: 20 },
      })
      .mockResolvedValueOnce({
        publishedBatchCount: 1,
        model: { page_count: 10 },
      });
    mocks.hasActiveTutorials.mockReturnValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tutorials: [
        { id: "queued-id", status: "queued", availability: null },
        {
          id: "processing-id",
          status: "processing",
          availability: { batchCount: 2, pageCount: 20 },
        },
        {
          id: "failed-id",
          status: "failed",
          availability: { batchCount: 1, pageCount: 10 },
        },
      ],
    });
    expect(mocks.hasActiveTutorials).toHaveBeenCalledWith([
      { id: "queued-id", status: "queued", availability: null },
      {
        id: "processing-id",
        status: "processing",
        availability: { batchCount: 2, pageCount: 20 },
      },
      {
        id: "failed-id",
        status: "failed",
        availability: { batchCount: 1, pageCount: 10 },
      },
    ]);
    expect(mocks.after).toHaveBeenCalledWith(mocks.runTutorialQueue);
  });
});

import { describe, expect, it } from "vitest";

import {
  getTutorialAvailabilityLabel,
  getTutorialAvailabilityMessage,
  hasNewerTutorialAvailability,
  haveTutorialAvailabilityChanged,
  isTutorialOpenable,
  type ProgressiveTutorialResponse,
  type TutorialStatusItem,
} from "./tutorial-progressive";

function tutorial(
  overrides: Partial<
    Pick<
      ProgressiveTutorialResponse,
      "availability" | "sourcePageCount" | "status" | "error"
    >
  > = {},
) {
  return {
    availability: { batchCount: 1, pageCount: 2 },
    sourcePageCount: 5,
    status: "processing" as const,
    error: null,
    ...overrides,
  };
}

describe("progressive tutorial availability", () => {
  it("opens failed tutorials when a published prefix exists", () => {
    expect(isTutorialOpenable(tutorial({ status: "failed" }))).toBe(true);
    expect(isTutorialOpenable(tutorial({ availability: null }))).toBe(false);
  });

  it("formats the available and source page counts", () => {
    expect(getTutorialAvailabilityLabel(tutorial())).toBe(
      "2 of 5 pages available",
    );
  });

  it("detects a newer batch in status polling", () => {
    const current = tutorial();
    const next = tutorial({
      availability: { batchCount: 2, pageCount: 4 },
    });
    const previousAvailability = new Map([
      ["tutorial-1", current.availability],
    ]);
    const nextStatuses: TutorialStatusItem[] = [
      {
        id: "tutorial-1",
        status: next.status,
        availability: next.availability,
      },
    ];

    expect(hasNewerTutorialAvailability(current, next)).toBe(true);
    expect(
      haveTutorialAvailabilityChanged(previousAvailability, nextStatuses),
    ).toBe(true);
  });

  it("explains the boundary and later preparation states", () => {
    expect(
      getTutorialAvailabilityMessage({
        tutorial: tutorial(),
        currentPage: 2,
        currentPageCount: 2,
        pendingSnapshotReady: false,
      }),
    ).toContain("Preparing the next section");

    expect(
      getTutorialAvailabilityMessage({
        tutorial: tutorial({ status: "failed", error: "Retry is available." }),
        currentPage: 1,
        currentPageCount: 2,
        pendingSnapshotReady: false,
      }),
    ).toContain("Earlier pages remain available");

    expect(
      getTutorialAvailabilityMessage({
        tutorial: tutorial(),
        currentPage: 2,
        currentPageCount: 2,
        pendingSnapshotReady: true,
      }),
    ).toContain("End the tutor session");
  });
});

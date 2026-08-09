import { describe, expect, it } from "vitest";

import {
  countActiveTutorials,
  getTutorialTransitionMessage,
  haveTutorialStatusesChanged,
  hasActiveTutorials,
  isTutorialStatusResponse,
  type TutorialStatusItem,
} from "@/lib/tutorial-status";

const tutorialIds = {
  first: "00000000-0000-4000-8000-000000000001",
  second: "00000000-0000-4000-8000-000000000002",
};

function tutorial(
  id: string,
  status: TutorialStatusItem["status"],
): TutorialStatusItem {
  return { id, status, availability: null };
}

describe("tutorial polling decisions", () => {
  it("polls while a tutorial is queued or processing", () => {
    expect(
      hasActiveTutorials([
        tutorial("ready", "ready"),
        tutorial("queued", "queued"),
      ]),
    ).toBe(true);
    expect(
      hasActiveTutorials([tutorial("processing", "processing")]),
    ).toBe(true);
  });

  it("stops polling when every tutorial is terminal", () => {
    expect(
      hasActiveTutorials([
        tutorial("ready", "ready"),
        tutorial("failed", "failed"),
      ]),
    ).toBe(false);
    expect(hasActiveTutorials([])).toBe(false);
  });

  it("counts queued and processing tutorials separately", () => {
    expect(
      countActiveTutorials([
        tutorial("queued-1", "queued"),
        tutorial("processing", "processing"),
        tutorial("queued-2", "queued"),
        tutorial("ready", "ready"),
      ]),
    ).toEqual({ queued: 2, processing: 1 });
  });
});

describe("tutorial status responses", () => {
  it("accepts a valid tutorial status snapshot", () => {
    expect(
      isTutorialStatusResponse({
        tutorials: [tutorial(tutorialIds.first, "processing")],
      }),
    ).toBe(true);
  });

  it.each([
    null,
    {},
    { tutorials: "processing" },
    { tutorials: [{ id: "not-a-tutorial-id", status: "ready" }] },
    {
      tutorials: [{ id: tutorialIds.first, status: "unknown" }],
    },
    {
      tutorials: [
        tutorial(tutorialIds.first, "queued"),
        tutorial(tutorialIds.first, "processing"),
      ],
    },
  ])("rejects invalid response %#", (value) => {
    expect(isTutorialStatusResponse(value)).toBe(false);
  });
});

describe("tutorial status snapshot changes", () => {
  const currentStatuses: ReadonlyMap<
    string,
    TutorialStatusItem["status"]
  > = new Map([
    [tutorialIds.first, "queued"],
    [tutorialIds.second, "processing"],
  ]);

  it("does not refresh when ids and statuses are unchanged", () => {
    expect(
      haveTutorialStatusesChanged(currentStatuses, [
        tutorial(tutorialIds.second, "processing"),
        tutorial(tutorialIds.first, "queued"),
      ]),
    ).toBe(false);
  });

  it.each([
    ["queued to processing", tutorial(tutorialIds.first, "processing")],
    ["processing to ready", tutorial(tutorialIds.second, "ready")],
    ["processing to failed", tutorial(tutorialIds.second, "failed")],
  ])("refreshes for a %s transition", (_name, changedTutorial) => {
    const nextTutorials = [
      tutorial(tutorialIds.first, "queued"),
      tutorial(tutorialIds.second, "processing"),
    ].map((item) =>
      item.id === changedTutorial.id ? changedTutorial : item,
    );

    expect(
      haveTutorialStatusesChanged(currentStatuses, nextTutorials),
    ).toBe(true);
  });

  it("refreshes when an id is added", () => {
    expect(
      haveTutorialStatusesChanged(currentStatuses, [
        tutorial(tutorialIds.first, "queued"),
        tutorial(tutorialIds.second, "processing"),
        tutorial("00000000-0000-4000-8000-000000000003", "ready"),
      ]),
    ).toBe(true);
  });

  it("refreshes when an id is removed", () => {
    expect(
      haveTutorialStatusesChanged(currentStatuses, [
        tutorial(tutorialIds.first, "queued"),
      ]),
    ).toBe(true);
  });

  it("refreshes when a published availability batch expands", () => {
    const currentStatuses = new Map<string, TutorialStatusItem>([
      [
        tutorialIds.first,
        {
          ...tutorial(tutorialIds.first, "processing"),
          availability: { batchCount: 1, pageCount: 10 },
        },
      ],
    ]);

    expect(
      haveTutorialStatusesChanged(currentStatuses, [
        {
          ...tutorial(tutorialIds.first, "processing"),
          availability: { batchCount: 2, pageCount: 20 },
        },
      ]),
    ).toBe(true);
  });
});

describe("tutorial notification transitions", () => {
  it("does not notify for the initial status load", () => {
    expect(
      getTutorialTransitionMessage(null, [
        tutorial("tutorial", "ready"),
      ]),
    ).toBeNull();
  });

  it("notifies when active work becomes ready", () => {
    expect(
      getTutorialTransitionMessage(
        new Map([["tutorial", "processing"]]),
        [tutorial("tutorial", "ready")],
      ),
    ).toBe("Your document is ready to open.");
  });

  it("uses the failure notification when any active work fails", () => {
    expect(
      getTutorialTransitionMessage(
        new Map([
          ["ready-tutorial", "queued"],
          ["failed-tutorial", "processing"],
        ]),
        [
          tutorial("ready-tutorial", "ready"),
          tutorial("failed-tutorial", "failed"),
        ],
      ),
    ).toBe(
      "A document could not be prepared. Open the library to retry.",
    );
  });

  it("does not notify again after the terminal status is recorded", () => {
    expect(
      getTutorialTransitionMessage(
        new Map([["tutorial", "ready"]]),
        [tutorial("tutorial", "ready")],
      ),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  countActiveTutorials,
  getTutorialTransitionMessage,
  hasActiveTutorials,
  type TutorialStatusItem,
} from "@/lib/tutorial-status";

function tutorial(
  id: string,
  status: TutorialStatusItem["status"],
): TutorialStatusItem {
  return { id, status };
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

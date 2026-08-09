import { describe, expect, it } from "vitest";

import { technicalLessonActions } from "./technical-lesson-actions";

describe("technical lesson actions", () => {
  it("keeps the agreed learner labels and action order", () => {
    expect(technicalLessonActions).toEqual([
      { action: "example", label: "Show an example" },
      { action: "visualize", label: "Visualize it" },
      { action: "prerequisite", label: "Prerequisite help" },
      { action: "walkthrough", label: "Walk through it" },
      { action: "formal", label: "Show the mathematics" },
      { action: "check", label: "Test me" },
    ]);
  });
});

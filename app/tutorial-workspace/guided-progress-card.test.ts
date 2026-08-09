import { describe, expect, it } from "vitest";

import type { GuidedSegmentProgress } from "@/lib/use-realtime-tutor";

import { getGuidedContinueButtonLabel } from "./guided-progress-card";

const completedProgress = {
  pageIndex: 2,
  chunkId: "chunk-1",
  sectionTitle: "Section",
  title: "Lesson",
  sourceText: "Source",
  conceptName: null,
  learningPhase: null,
  attemptNumber: null,
  segmentNumber: 1,
  segmentCount: 1,
  segmentComplete: true,
  pageComplete: true,
} satisfies GuidedSegmentProgress;

describe("guided progress boundary labels", () => {
  it("marks the available boundary while the next section is preparing", () => {
    expect(
      getGuidedContinueButtonLabel(
        completedProgress,
        false,
        false,
        true,
      ),
    ).toBe("Preparing the next section…");
  });
});

import { describe, expect, it } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import {
  createEmptyGuidedProgress,
  summarizeGuidedProgress,
  updateGuidedProgress,
  validateGuidedProgress,
} from "@/lib/guided-progress";

const tutorialId = "6cf395b6-b6b7-4492-9705-7168d3d25a0b";
const now = new Date("2026-08-07T09:00:00.000Z");

describe("guided reading progress", () => {
  it("restarts an in-progress section and advances after completion", () => {
    const empty = createEmptyGuidedProgress(tutorialId, now);
    const started = updateGuidedProgress(
      empty,
      {
        type: "segment_started",
        pageIndex: 1,
        chunkId: "chunk:first",
      },
      model,
      now,
    );

    expect(started.cursor).toEqual({
      pageIndex: 1,
      chunkId: "chunk:first",
      state: "in_progress",
    });

    const completed = updateGuidedProgress(
      started,
      {
        type: "segment_completed",
        pageIndex: 1,
        chunkId: "chunk:first",
      },
      model,
      now,
    );

    expect(completed.cursor).toEqual({
      pageIndex: 1,
      chunkId: "chunk:second",
      state: "pending",
    });
    expect(completed.completedChunkIds).toEqual(["chunk:first"]);
  });

  it("skips empty pages and finishes after the final section", () => {
    let progress = createEmptyGuidedProgress(tutorialId, now);

    for (const [pageIndex, chunkId] of [
      [1, "chunk:first"],
      [1, "chunk:second"],
      [3, "chunk:third"],
    ] as const) {
      progress = updateGuidedProgress(
        progress,
        { type: "segment_completed", pageIndex, chunkId },
        model,
        now,
      );
    }

    expect(progress.cursor).toBeNull();
    expect(summarizeGuidedProgress(model, progress)).toEqual({
      completedChunks: 3,
      totalChunks: 3,
      completedPages: 2,
      totalInstructionalPages: 2,
      percentage: 100,
    });
  });

  it("validates stored chunk references", () => {
    const progress = createEmptyGuidedProgress(tutorialId, now);

    expect(
      validateGuidedProgress(progress, tutorialId, model),
    ).toEqual(progress);
    expect(() =>
      validateGuidedProgress(
        {
          ...progress,
          completedChunkIds: ["chunk:missing"],
        },
        tutorialId,
        model,
      ),
    ).toThrow("references unavailable content");
  });
});

const model: DocumentModel = {
  schema_version: 5,
  document_id: tutorialId,
  title: "Document",
  page_count: 3,
  pages: [
    {
      page_index: 1,
      page_label: "1",
      chunks: [chunk("chunk:first"), chunk("chunk:second")],
    },
    {
      page_index: 2,
      page_label: "2",
      chunks: [],
    },
    {
      page_index: 3,
      page_label: "3",
      chunks: [chunk("chunk:third")],
    },
  ],
  concepts: [],
  connections: [],
};

function chunk(id: string) {
  return {
    id,
    section_title: "Section",
    sources: [
      {
        page_index: 1,
        source_text: "Source",
        highlight_bounds: [
          {
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.1,
          },
        ],
      },
    ],
    title: id,
    summary: "Summary",
    concept_ids: [],
  };
}

import { describe, expect, it } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import {
  buildGuidedSegmentInstructions,
  buildTechnicalLessonActionInstructions,
  buildTutorInstructions,
} from "@/lib/realtime-tutor/instructions";
import { technicalLessonActionValues } from "@/lib/realtime-tutor/types";

describe("technical guided teaching instructions", () => {
  it("adds progressive disclosure to guided reading and active learning", () => {
    const model = createModel();
    const segment = buildGuidedSegmentInstructions(
      model,
      1,
      0,
      "plain",
      { previous_segments: [], upcoming_segments: [] },
    );
    const session = buildTutorInstructions(
      model,
      "guided",
      "learning",
      "plain",
    );

    for (const instructions of [segment, session]) {
      expect(instructions).toContain(
        "begin with its purpose or the problem it solves",
      );
      expect(instructions).toContain("give a simple working mental model");
      expect(instructions).toContain("give a short mechanism walkthrough");
      expect(instructions).toContain(
        "Defer formal notation, equations, exact terminology, and deeper detail",
      );
      expect(instructions).toContain(
        "Do not name, classify, or persist that difficulty",
      );
    }
  });

  it("keeps narrative lessons natural instead of requiring a fixed treatment", () => {
    const instructions = buildGuidedSegmentInstructions(
      createModel(),
      1,
      0,
      "plain",
      { previous_segments: [], upcoming_segments: [] },
    );

    expect(instructions).toContain(
      "When the lesson is narrative or otherwise non-technical, keep the explanation coherent and natural.",
    );
    expect(instructions).toContain(
      "Do not force it into artificial steps.",
    );
  });

  it("gives every lesson action a distinct focused instruction", () => {
    const instructions = technicalLessonActionValues.map((action) =>
      buildTechnicalLessonActionInstructions(
        createModel(),
        1,
        0,
        action,
        "technical",
      ),
    );

    expect(new Set(instructions).size).toBe(
      technicalLessonActionValues.length,
    );
    expect(instructions[0]).toContain(
      "Give one concise, concrete example tied directly to the active lesson.",
    );
    expect(instructions[1]).toContain(
      "This action is handled by the visual workspace",
    );
    expect(instructions[2]).toContain(
      "Name one likely prerequisite",
    );
    expect(instructions[3]).toContain(
      "Explain the active mechanism in a small ordered sequence.",
    );
    expect(instructions[4]).toContain(
      "Reveal the precise terminology, notation, equations, or formal mechanism",
    );
    expect(instructions[5]).toContain(
      "Ask one short application or prediction question",
    );
  });
});

function createModel(): DocumentModel {
  return {
    schema_version: 5,
    document_id: "document-1",
    title: "A technical paper",
    page_count: 1,
    pages: [
      {
        page_index: 1,
        page_label: "1",
        chunks: [
          {
            id: "chunk-1",
            section_title: "Method",
            title: "A mechanism",
            summary: "A prepared mechanism summary.",
            concept_ids: [],
            sources: [
              {
                page_index: 1,
                source_text: "The mechanism transforms the input.",
                highlight_bounds: [],
              },
            ],
          },
        ],
      },
    ],
    concepts: [],
    connections: [],
  };
}

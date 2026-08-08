import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentModel } from "@/lib/document-model";
import {
  generateLearningVisual,
  resolveLearningVisualGrounding,
} from "@/lib/learning-visual/generation";
import type { LearningVisualGenerationInput } from "@/lib/learning-visual/types";
import { InvalidLearningVisualOutputError } from "@/lib/learning-visual/validation";

const input: LearningVisualGenerationInput = {
  learnerQuestion: "Why are there two paths?",
  confusionSummary: "The learner sees one signal but two outcomes.",
  learningGoal: "Connect the split to the two outcomes.",
  pageIndex: 2,
  chunkId: "chunk:p2-split",
  selectionText: "the signal divides",
  pageImageUrl: "data:image/png;base64,AAAA",
  explanationStyle: "plain",
};

describe("learning-visual grounding", () => {
  it("resolves the exact selected chunk evidence and nearby prepared concepts", () => {
    const grounding = resolveLearningVisualGrounding(model(), input);

    expect(grounding).toMatchObject({
      documentTitle: "Signal paper",
      page: { pageIndex: 2, pageLabel: "2" },
      chunks: [
        {
          chunkId: "chunk:p2-split",
          sectionTitle: "Signal routing",
          exactSourcePassages: [
            {
              pageIndex: 2,
              sourceText: "Exact prepared source: the signal divides into path A and path B.",
            },
          ],
        },
      ],
    });
    expect(grounding.nearbyPreparedConcepts.map((concept) => concept.id)).toEqual([
      "concept:split",
      "concept:outcome",
    ]);
  });

  it("rejects a chunk that is not on the requested page", () => {
    expect(() =>
      resolveLearningVisualGrounding(model(), {
        ...input,
        chunkId: "chunk:p1-intro",
      }),
    ).toThrow("The requested document chunk is not available on that page.");
  });
});

describe("learning-visual generation", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://azure.example.test");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "secret");
    vi.stubEnv("AZURE_OPENAI_FLAGSHIP_DEPLOYMENT", "flagship");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends exact prepared evidence and the page image and returns the frozen contract", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamedOutput(validGeneratedOutput()));

    const visual = await generateLearningVisual(
      model(),
      input,
      new AbortController().signal,
    );

    expect(visual).toMatchObject({
      title: "Signal split",
      strategy: "process",
      altText: "One signal splitting into two outcome paths.",
      narrationCues: [
        {
          id: "signal-split",
          label: "Signal split",
          meaning: "One input branches into two paths.",
        },
      ],
    });
    expect(visual.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const request = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    ) as {
      store: boolean;
      input: Array<{
        content: Array<{ type: string; image_url?: string; text?: string }>;
      }>;
    };
    expect(request.store).toBe(false);
    expect(request.input[0].content[0]).toEqual({
      type: "input_image",
      image_url: input.pageImageUrl,
      detail: "high",
    });
    expect(request.input[0].content[1].text).toContain(
      "Exact prepared source: the signal divides into path A and path B.",
    );
    expect(request.input[0].content[1].text).toContain(
      '"definition": "An input branching into distinct paths."',
    );
  });

  it("rejects invalid generated output without a repair request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedOutput({
        ...validGeneratedOutput(),
        htmlFragment: validGeneratedOutput().htmlFragment.replace(
          "const root",
          "fetch('/invented'); const root",
        ),
      }),
    );

    await expect(
      generateLearningVisual(
        model(),
        input,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(InvalidLearningVisualOutputError);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});

function streamedOutput(output: object) {
  const response = {
    status: "completed",
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify(output),
          },
        ],
      },
    ],
  };
  const event = {
    type: "response.completed",
    response,
  };

  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function validGeneratedOutput() {
  return {
    title: "Signal split",
    strategy: "process",
    htmlFragment: `<section data-learning-visual aria-label="Signal split explainer">
  <style>[data-learning-visual] .node { display: grid; }</style>
  <button class="node" type="button" data-narration-cue="signal-split" aria-label="Show signal split">Signal split</button>
  <script>(() => { const root = document.currentScript?.parentElement; root?.querySelector('button')?.addEventListener('click', () => {}); })();</script>
</section>`,
    narrationCues: [
      {
        id: "signal-split",
        label: "Signal split",
        meaning: "One input branches into two paths.",
      },
    ],
    altText: "One signal splitting into two outcome paths.",
  };
}

function model(): DocumentModel {
  return {
    schema_version: 5,
    document_id: "tutorial-id",
    title: "Signal paper",
    page_count: 2,
    pages: [
      {
        page_index: 1,
        page_label: "1",
        chunks: [
          {
            id: "chunk:p1-intro",
            section_title: "Introduction",
            title: "Signal introduction",
            summary: "Introduces the signal.",
            concept_ids: [],
            sources: [
              {
                page_index: 1,
                source_text: "The paper introduces a signal.",
                highlight_bounds: [],
              },
            ],
          },
        ],
      },
      {
        page_index: 2,
        page_label: "2",
        chunks: [
          {
            id: "chunk:p2-split",
            section_title: "Signal routing",
            title: "The signal split",
            summary: "The signal divides into two paths.",
            concept_ids: ["concept:split"],
            sources: [
              {
                page_index: 2,
                source_text:
                  "Exact prepared source: the signal divides into path A and path B.",
                highlight_bounds: [],
              },
            ],
          },
        ],
      },
    ],
    concepts: [
      {
        id: "concept:split",
        name: "Signal split",
        definition: "An input branching into distinct paths.",
        occurrences: [
          {
            page_index: 2,
            page_label: "2",
            role: "explained",
            explicitness: "explicit",
            confidence: 1,
          },
        ],
      },
      {
        id: "concept:outcome",
        name: "Outcome",
        definition: "The result produced by a path.",
        occurrences: [
          {
            page_index: 2,
            page_label: "2",
            role: "referenced",
            explicitness: "implicit",
            confidence: 0.8,
          },
        ],
      },
    ],
    connections: [
      {
        from: "concept:split",
        to: "concept:outcome",
        relationship: "causes",
        relevant_pages: [2],
        reason: "Each path leads to an outcome.",
        confidence: 0.9,
      },
    ],
  };
}

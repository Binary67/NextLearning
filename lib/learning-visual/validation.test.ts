import { describe, expect, it } from "vitest";

import {
  InvalidLearningVisualOutputError,
  LearningVisualInputError,
  parseLearningVisualGenerationInput,
  validateLearningVisualOutput,
} from "@/lib/learning-visual/validation";

const validInput = {
  learnerQuestion: "Why does the signal split?",
  confusionSummary: "The learner is mixing up the two paths.",
  learningGoal: "Explain how the paths differ.",
  pageIndex: 2,
  chunkId: "chunk:p2-paths",
  selectionText: "the signal follows two paths",
  pageImageUrl: "data:image/png;base64,AAAA",
  explanationStyle: "plain",
};

describe("learning-visual input validation", () => {
  it("accepts and trims the exact frozen input shape", () => {
    expect(
      parseLearningVisualGenerationInput({
        ...validInput,
        learnerQuestion: "  Why does the signal split?  ",
      }),
    ).toEqual(validInput);
  });

  it.each([
    ["an extra property", { ...validInput, extra: true }],
    ["a zero page index", { ...validInput, pageIndex: 0 }],
    ["an empty question", { ...validInput, learnerQuestion: " " }],
    ["an insecure image URL", { ...validInput, pageImageUrl: "http://example.com/page.png" }],
    ["an unknown explanation style", { ...validInput, explanationStyle: "brief" }],
  ])("rejects %s", (_description, input) => {
    expect(() => parseLearningVisualGenerationInput(input)).toThrow(
      LearningVisualInputError,
    );
  });
});

describe("learning-visual output validation", () => {
  it("accepts a scoped fragment with directly tied visible cue labels", () => {
    expect(
      validateLearningVisualOutput(JSON.stringify(validOutput())),
    ).toMatchObject({
      strategy: "process",
      narrationCues: [{ id: "split", label: "Signal split" }],
    });
  });

  it.each([
    [
      "a full document",
      '<!doctype html><html><body><p>Signal split</p></body></html>',
    ],
    ["a network primitive", validFragment().replace("const root", "fetch('/x'); const root")],
    ["an external resource", validFragment().replace("<button", '<img src="https://example.com/x.png"><button')],
    ["a cue without its visible binding", validFragment().replace("data-narration-cue", "data-cue")],
  ])("rejects %s", (_description, htmlFragment) => {
    expect(() =>
      validateLearningVisualOutput(
        JSON.stringify({ ...validOutput(), htmlFragment }),
      ),
    ).toThrow(InvalidLearningVisualOutputError);
  });

  it("rejects duplicate cue ids", () => {
    const output = validOutput();
    output.narrationCues.push({ ...output.narrationCues[0] });

    expect(() => validateLearningVisualOutput(JSON.stringify(output))).toThrow(
      InvalidLearningVisualOutputError,
    );
  });
});

function validOutput() {
  return {
    title: "How the signal splits",
    strategy: "process",
    htmlFragment: validFragment(),
    narrationCues: [
      {
        id: "split",
        label: "Signal split",
        meaning: "The input branches into two paths.",
      },
    ],
    altText: "A control showing one input branching into two paths.",
  };
}

function validFragment() {
  return `<section data-learning-visual aria-label="Signal path explainer">
  <style>[data-learning-visual] .node { display: grid; }</style>
  <button class="node" type="button" data-narration-cue="split" aria-label="Show signal split">Signal split</button>
  <script>(() => { const root = document.currentScript?.parentElement; root?.querySelector('button')?.addEventListener('click', () => {}); })();</script>
</section>`;
}

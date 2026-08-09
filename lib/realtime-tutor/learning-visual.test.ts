import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderPdfPageImage } from "@/lib/pdf-page-renderer";
import { createRealtimeResponseState } from "@/lib/realtime-response-state";
import {
  createLearnerRequestedLearningVisual,
  createLearningVisual,
} from "@/lib/realtime-tutor/learning-visual";
import { buildTutorInstructions } from "@/lib/realtime-tutor/instructions";
import {
  endSession,
  resetSession,
} from "@/lib/realtime-tutor/lifecycle";
import {
  CREATE_LEARNING_VISUAL_TOOL_NAME,
  createLearningVisualTool,
  readCreateLearningVisualArguments,
} from "@/lib/realtime-tutor/tools/create-learning-visual";
import {
  learningRealtimeTutorTools,
  realtimeTutorTools,
} from "@/lib/realtime-tutor/tools";
import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";

vi.mock("@/lib/pdf-page-renderer", () => ({
  renderPdfPageImage: vi.fn(),
}));

const visual = {
  id: "visual-1",
  title: "Attention flow",
  strategy: "process" as const,
  htmlFragment: "<div>private visual HTML</div>",
  narrationCues: [
    {
      id: "cue-1",
      label: "Query",
      meaning: "The item looking for relevant context.",
    },
  ],
  altText: "A flow from a query to relevant context.",
};
const toolArguments = {
  learnerQuestion: "Why does the query choose this token?",
  confusionSummary: "The learner is mixing up queries and keys.",
  learningGoal: "Distinguish the query's role from the key's role.",
};

describe("create_learning_visual tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("registers the exact model-visible arguments in every tutor mode", () => {
    expect(createLearningVisualTool.name).toBe(
      CREATE_LEARNING_VISUAL_TOOL_NAME,
    );
    expect(Object.keys(createLearningVisualTool.parameters.properties)).toEqual(
      ["learner_question", "confusion_summary", "learning_goal"],
    );
    expect(createLearningVisualTool.parameters.additionalProperties).toBe(
      false,
    );
    expect(realtimeTutorTools).toContain(createLearningVisualTool);
    expect(learningRealtimeTutorTools).toContain(createLearningVisualTool);
  });

  it("tells the tutor when to request and narrate a visual", () => {
    const instructions = buildTutorInstructions(
      { title: "Attention" } as Parameters<
        typeof buildTutorInstructions
      >[0],
      "guided",
      "reading",
      "plain",
    );

    expect(instructions).toContain(
      "Use create_learning_visual only when a spatial, dynamic, quantitative, process, comparison, or relationship depiction would materially improve understanding.",
    );
    expect(instructions).toContain(
      "Do not use it for simple facts or decorative output.",
    );
    expect(instructions).toContain(
      "explain the visible result using its narration cue labels",
    );
  });

  it("accepts only the three required non-empty strings", () => {
    expect(
      readCreateLearningVisualArguments(
        JSON.stringify({
          learner_question: "  Why does this happen?  ",
          confusion_summary: "The two stages look identical.",
          learning_goal: "Tell the stages apart.",
        }),
      ),
    ).toEqual({
      learnerQuestion: "  Why does this happen?  ",
      confusionSummary: "The two stages look identical.",
      learningGoal: "Tell the stages apart.",
    });

    expect(() =>
      readCreateLearningVisualArguments(
        JSON.stringify({
          learner_question: "Why?",
          confusion_summary: " ",
          learning_goal: "Understand it.",
        }),
      ),
    ).toThrow("The learning visual arguments are invalid.");
    expect(() =>
      readCreateLearningVisualArguments(
        JSON.stringify({
          learner_question: "Why?",
          confusion_summary: "The stages are unclear.",
          learning_goal: "Understand it.",
          page_index: 7,
        }),
      ),
    ).toThrow("The learning visual arguments are invalid.");
  });

  it("assembles authoritative source context and returns narration metadata only", async () => {
    const runtime = createRuntime();
    vi.mocked(renderPdfPageImage).mockResolvedValue({
      imageUrl: "data:image/jpeg;base64,page-image",
      width: 1400,
      height: 1800,
    });
    vi.mocked(fetch).mockResolvedValue(response(true, visual));

    const output = await createLearningVisual(runtime, toolArguments);

    expect(renderPdfPageImage).toHaveBeenCalledWith(
      "tutorial-1",
      "/api/tutorials/tutorial-1/file",
      2,
      4 * 1024 * 1024,
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/tutorials/tutorial-1/learning-visuals",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          pageIndex: 2,
          chunkId: "chunk-2",
          selectionText: "selected source",
          pageImageUrl: "data:image/jpeg;base64,page-image",
          explanationStyle: "technical",
          request: {
            origin: "tutor",
            learnerQuestion: toolArguments.learnerQuestion,
            confusionSummary: toolArguments.confusionSummary,
            learningGoal: toolArguments.learningGoal,
          },
        }),
      }),
    );
    expect(output).toEqual({
      status: "ready",
      visual_id: "visual-1",
      title: "Attention flow",
      strategy: "process",
      narration_cues: visual.narrationCues,
    });
    expect(output).not.toHaveProperty("htmlFragment");
    expect(runtime.setLearningVisualState).toHaveBeenNthCalledWith(1, {
      status: "generating",
    });
    expect(runtime.setLearningVisualState).toHaveBeenNthCalledWith(2, {
      status: "ready",
      visual,
    });
  });

  it("creates a learner-requested visual without invented confusion context", async () => {
    const runtime = createRuntime();
    vi.mocked(renderPdfPageImage).mockResolvedValue({
      imageUrl: "data:image/jpeg;base64,page-image",
      width: 1400,
      height: 1800,
    });
    vi.mocked(fetch).mockResolvedValue(response(true, visual));

    await createLearnerRequestedLearningVisual(runtime, 2);

    expect(fetch).toHaveBeenCalledWith(
      "/api/tutorials/tutorial-1/learning-visuals",
      expect.objectContaining({
        body: JSON.stringify({
          pageIndex: 2,
          chunkId: null,
          selectionText: "selected source",
          pageImageUrl: "data:image/jpeg;base64,page-image",
          explanationStyle: "technical",
          request: { origin: "learner" },
        }),
      }),
    );
  });

  it("grounds a guided learner visual to the requested active chunk", async () => {
    const runtime = createRuntime();
    vi.mocked(renderPdfPageImage).mockResolvedValue({
      imageUrl: "data:image/jpeg;base64,page-image",
      width: 1400,
      height: 1800,
    });
    vi.mocked(fetch).mockResolvedValue(response(true, visual));

    await createLearnerRequestedLearningVisual(runtime, 2, "chunk-2");

    expect(fetch).toHaveBeenCalledWith(
      "/api/tutorials/tutorial-1/learning-visuals",
      expect.objectContaining({
        body: expect.stringContaining('"chunkId":"chunk-2"'),
      }),
    );
  });

  it("replaces the previous visual with the next request", async () => {
    const runtime = createRuntime();
    const nextVisual = { ...visual, id: "visual-2", title: "Key matching" };
    vi.mocked(renderPdfPageImage).mockResolvedValue({
      imageUrl: "data:image/jpeg;base64,page-image",
      width: 1400,
      height: 1800,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(true, visual))
      .mockResolvedValueOnce(response(true, nextVisual));

    await createLearningVisual(runtime, toolArguments);
    await createLearningVisual(runtime, toolArguments);

    expect(runtime.setLearningVisualState).toHaveBeenNthCalledWith(3, {
      status: "generating",
    });
    expect(runtime.setLearningVisualState).toHaveBeenLastCalledWith({
      status: "ready",
      visual: nextVisual,
    });
  });

  it("exposes endpoint and missing-context failures as controlled error state", async () => {
    const endpointRuntime = createRuntime();
    vi.mocked(renderPdfPageImage).mockResolvedValue({
      imageUrl: "data:image/jpeg;base64,page-image",
      width: 1400,
      height: 1800,
    });
    vi.mocked(fetch).mockResolvedValue(
      response(false, { message: "Visual generation is unavailable." }),
    );

    await expect(
      createLearningVisual(endpointRuntime, toolArguments),
    ).rejects.toThrow("Visual generation is unavailable.");
    expect(endpointRuntime.setLearningVisualState).toHaveBeenLastCalledWith({
      status: "error",
      message: "Visual generation is unavailable.",
    });

    const missingContextRuntime = createRuntime();
    missingContextRuntime.activePageContextItemRef.current = null;

    await expect(
      createLearningVisual(missingContextRuntime, toolArguments),
    ).rejects.toThrow("The active PDF page context is unavailable.");
    expect(missingContextRuntime.setLearningVisualState).toHaveBeenLastCalledWith(
      {
        status: "error",
        message: "The active PDF page context is unavailable.",
      },
    );
  });

  it("clears visual state when the session resets or ends", async () => {
    const runtime = createLifecycleRuntime();

    resetSession(runtime);

    expect(runtime.setLearningVisualState).toHaveBeenCalledWith({
      status: "idle",
    });

    vi.mocked(runtime.setLearningVisualState).mockClear();
    await endSession(runtime);

    expect(runtime.setLearningVisualState).toHaveBeenCalledWith({
      status: "idle",
    });
  });
});

function createRuntime() {
  return {
    optionsRef: {
      current: {
        documentId: "tutorial-1",
        documentModel: {
          pages: [
            { chunks: [] },
            { chunks: [{ id: "chunk-2" }] },
          ],
        },
        selection: {
          page_index: 2,
          text: "selected source",
        },
        explanationStyle: "technical",
      },
    },
    activePageContextItemRef: {
      current: { pageIndex: 2, itemId: "page-item" },
    },
    guidedSegmentStateRef: {
      current: { pageIndex: 2, segmentIndex: 0, complete: false },
    },
    setLearningVisualState: vi.fn(),
  } as unknown as RealtimeTutorRuntime;
}

function createLifecycleRuntime() {
  return {
    optionsRef: { current: { documentId: null } },
    tutorAudioCaptureRef: { current: null },
    tutorReplayAudioRef: { current: null },
    tutorReplayUrlRef: { current: null },
    pendingServerEventsRef: { current: new Map() },
    dataChannelRef: { current: null },
    peerConnectionRef: { current: null },
    mediaStreamRef: { current: null },
    remoteAudioRef: { current: null },
    isUserTurnRef: { current: false },
    userTurnTransitionRef: { current: false },
    responseStateRef: { current: createRealtimeResponseState() },
    tutorTranscriptRef: { current: "" },
    selectionContextItemRef: { current: null },
    activePageContextItemRef: { current: null },
    auxiliaryPageContextItemRef: { current: null },
    sessionModeRef: { current: null },
    guidedTutorModeRef: { current: null },
    activeTutorSessionRef: { current: null },
    guidedSegmentStateRef: { current: null },
    activeLearningCheckpointRef: { current: null },
    checkpointedConceptIdsRef: { current: new Set() },
    setGuidedSegmentProgress: vi.fn(),
    setLearningVisualState: vi.fn(),
    setStatus: vi.fn(),
    setIsUserTurn: vi.fn(),
    setIsSubmittingUserTurn: vi.fn(),
    setIsTutorResponding: vi.fn(),
    setIsTutorSpeaking: vi.fn(),
    setCanReplayTutorAudio: vi.fn(),
    setIsReplayingTutorAudio: vi.fn(),
    setCurrentTutorTranscript: vi.fn(),
    setTutorTranscriptHistory: vi.fn(),
    setError: vi.fn(),
  } as unknown as RealtimeTutorRuntime;
}

function response(ok: boolean, body: unknown) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

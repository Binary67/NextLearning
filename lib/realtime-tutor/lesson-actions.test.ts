import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRealtimeResponseState,
  supersedeRealtimeResponse,
} from "@/lib/realtime-response-state";
import { createLearnerRequestedLearningVisual } from "@/lib/realtime-tutor/learning-visual";
import { requestTechnicalLessonAction } from "@/lib/realtime-tutor/lesson-actions";
import { sendEventAndWait } from "@/lib/realtime-tutor/event-transport";
import { technicalLessonActionValues } from "@/lib/realtime-tutor/types";
import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";

vi.mock("@/lib/realtime-tutor/event-transport", () => ({
  sendEventAndWait: vi.fn(),
}));

vi.mock("@/lib/realtime-tutor/learning-visual", () => ({
  createLearnerRequestedLearningVisual: vi.fn(),
}));

describe("requestTechnicalLessonAction", () => {
  beforeEach(() => {
    vi.mocked(sendEventAndWait).mockReset();
    vi.mocked(sendEventAndWait).mockResolvedValue({
      type: "response.created",
    });
    vi.mocked(createLearnerRequestedLearningVisual).mockReset();
    vi.mocked(createLearnerRequestedLearningVisual).mockResolvedValue();
  });

  it("dispatches one distinct realtime request for each spoken action", async () => {
    const spokenActions = technicalLessonActionValues.filter(
      (action) => action !== "visualize",
    );

    for (const action of spokenActions) {
      const runtime = createRuntime();

      expect(
        await requestTechnicalLessonAction(
          runtime,
          "connected",
          false,
          action,
          1,
        ),
      ).toBe(true);

      expect(sendEventAndWait).toHaveBeenCalledOnce();
      const event = vi.mocked(sendEventAndWait).mock.calls[0][1] as {
        response: { input: unknown[]; instructions: string };
      };
      expect(event.response.input[0]).toEqual({
        type: "item_reference",
        id: "page-item",
      });
      expect(event.response.instructions).toContain(
        actionInstruction(action),
      );

      vi.mocked(sendEventAndWait).mockClear();
    }
  });

  it("routes visualize through the active chunk visual path", async () => {
    const runtime = createRuntime();

    expect(
      await requestTechnicalLessonAction(
        runtime,
        "connected",
        false,
        "visualize",
        1,
      ),
    ).toBe(true);

    expect(createLearnerRequestedLearningVisual).toHaveBeenCalledWith(
      runtime,
      1,
      "chunk-1",
    );
    expect(sendEventAndWait).not.toHaveBeenCalled();
  });

  it("rejects invalid, busy, and non-active requests without changing lesson state", async () => {
    const runtime = createRuntime();
    const guidedState = runtime.guidedSegmentStateRef.current;

    expect(
      await requestTechnicalLessonAction(
        runtime,
        "connected",
        false,
        "unknown" as never,
        1,
      ),
    ).toBe(false);
    expect(sendEventAndWait).not.toHaveBeenCalled();
    expect(runtime.guidedSegmentStateRef.current).toBe(guidedState);
    expect(runtime.setGuidedSegmentProgress).not.toHaveBeenCalled();

    runtime.responseStateRef.current = supersedeRealtimeResponse(
      "learner_question",
    );

    expect(
      await requestTechnicalLessonAction(
        runtime,
        "connected",
        false,
        "walkthrough",
        1,
      ),
    ).toBe(false);
    expect(sendEventAndWait).not.toHaveBeenCalled();
    expect(runtime.guidedSegmentStateRef.current).toBe(guidedState);

    runtime.responseStateRef.current = createRealtimeResponseState();
    expect(
      await requestTechnicalLessonAction(
        runtime,
        "connected",
        false,
        "walkthrough",
        2,
      ),
    ).toBe(false);
    expect(sendEventAndWait).not.toHaveBeenCalled();
  });

  it("uses the tutor error state when a realtime action cannot start", async () => {
    vi.mocked(sendEventAndWait).mockRejectedValueOnce(
      new Error("The connection rejected the action."),
    );
    const runtime = createRuntime();

    expect(
      await requestTechnicalLessonAction(
        runtime,
        "connected",
        false,
        "example",
        1,
      ),
    ).toBe(false);
    expect(runtime.responseStateRef.current).toEqual(
      createRealtimeResponseState(),
    );
    expect(runtime.setIsTutorResponding).toHaveBeenCalledWith(false);
    expect(runtime.setError).toHaveBeenLastCalledWith(
      "The connection rejected the action.",
    );
  });

  it("returns false and preserves the visual error path when visual creation fails", async () => {
    vi.mocked(createLearnerRequestedLearningVisual).mockRejectedValueOnce(
      new Error("The visual service is unavailable."),
    );
    const runtime = createRuntime();

    expect(
      await requestTechnicalLessonAction(
        runtime,
        "connected",
        false,
        "visualize",
        1,
      ),
    ).toBe(false);
    expect(runtime.setError).not.toHaveBeenCalled();
    expect(sendEventAndWait).not.toHaveBeenCalled();
  });
});

function actionInstruction(action: string) {
  switch (action) {
    case "example":
      return "Give one concise, concrete example";
    case "prerequisite":
      return "Name one likely prerequisite";
    case "walkthrough":
      return "Explain the active mechanism in a small ordered sequence";
    case "formal":
      return "Reveal the precise terminology, notation, equations";
    case "check":
      return "Ask one short application or prediction question";
    default:
      return "";
  }
}

function createRuntime(): RealtimeTutorRuntime {
  return {
    optionsRef: {
      current: {
        documentId: "document-1",
        documentModel: {
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
        },
        selection: null,
        textSelectionContext: null,
        relatedPagesLoading: false,
        explanationStyle: "plain",
        audioInputDeviceId: "",
        audioOutputDeviceId: "",
      },
    },
    dataChannelRef: {
      current: { readyState: "open" },
    } as unknown as RealtimeTutorRuntime["dataChannelRef"],
    sessionModeRef: { current: "guided" },
    userTurnTransitionRef: { current: false },
    isUserTurnRef: { current: false },
    responseStateRef: { current: createRealtimeResponseState() },
    activePageContextItemRef: {
      current: { pageIndex: 1, itemId: "page-item" },
    },
    guidedSegmentStateRef: {
      current: { pageIndex: 1, segmentIndex: 0, complete: false },
    },
    setError: vi.fn(),
    setIsTutorResponding: vi.fn(),
    setGuidedSegmentProgress: vi.fn(),
  } as unknown as RealtimeTutorRuntime;
}

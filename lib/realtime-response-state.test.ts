import { describe, expect, test } from "vitest";

import {
  activateRealtimeResponse,
  createRealtimeResponseState,
  finishRealtimeResponse,
  finishRealtimeResponseAudio,
  isActiveLogicalResponse,
  requestRealtimeContinuation,
  startRealtimeResponseAudio,
  supersedeRealtimeResponse,
} from "@/lib/realtime-response-state";

describe("Realtime response state", () => {
  test("ignores a cancelled response completion after its replacement starts", () => {
    let state = supersedeRealtimeResponse("guided_segment");
    state = activateRealtimeResponse(state, "response-a").state;
    state = createRealtimeResponseState();
    state = supersedeRealtimeResponse("guided_segment");
    state = activateRealtimeResponse(state, "response-b").state;

    const completedKinds: string[] = [];
    const lateA = finishRealtimeResponse(
      state,
      "response-a",
      false,
    );

    if (lateA.accepted && lateA.kind === "guided_segment") {
      completedKinds.push(lateA.kind);
    }

    state = lateA.state;
    const completedB = finishRealtimeResponse(
      state,
      "response-b",
      false,
    );

    if (completedB.accepted && completedB.kind === "guided_segment") {
      completedKinds.push(completedB.kind);
    }

    expect(completedKinds).toEqual(["guided_segment"]);
  });

  test("ignores late transcript and audio events from a retired response", () => {
    let state = supersedeRealtimeResponse("learner_question");
    state = activateRealtimeResponse(state, "response-a").state;
    state = createRealtimeResponseState();
    state = supersedeRealtimeResponse("learner_question");
    state = activateRealtimeResponse(state, "response-b").state;

    expect(isActiveLogicalResponse(state, "response-a")).toBe(false);

    const lateAudioStart = startRealtimeResponseAudio(
      state,
      "response-a",
    );

    expect(lateAudioStart.accepted).toBe(false);
    expect(lateAudioStart.state.audio).toBeNull();

    state = startRealtimeResponseAudio(state, "response-b").state;

    const lateAudioStop = finishRealtimeResponseAudio(
      state,
      "response-a",
    );

    expect(lateAudioStop.accepted).toBe(false);
    expect(lateAudioStop.state.audio?.id).toBe("response-b");
  });

  test("allows audio to finish after logical response completion", () => {
    let state = supersedeRealtimeResponse("learner_question");
    state = activateRealtimeResponse(state, "response-a").state;
    state = startRealtimeResponseAudio(state, "response-a").state;
    state = finishRealtimeResponse(
      state,
      "response-a",
      false,
    ).state;

    expect(state.logical).toBeNull();
    expect(state.audio?.id).toBe("response-a");

    const audioFinished = finishRealtimeResponseAudio(
      state,
      "response-a",
    );

    expect(audioFinished.accepted).toBe(true);
    expect(audioFinished.state.audio).toBeNull();
  });

  test("retains the original response kind through a tool continuation", () => {
    let state = supersedeRealtimeResponse("guided_segment");
    state = activateRealtimeResponse(state, "response-a").state;
    state = finishRealtimeResponse(
      state,
      "response-a",
      true,
    ).state;

    const continuation = requestRealtimeContinuation(
      state,
      "response-a",
    );

    expect(continuation.accepted).toBe(true);

    state = activateRealtimeResponse(
      continuation.state,
      "response-b",
    ).state;

    expect(state.logical).toEqual({
      id: "response-b",
      kind: "guided_segment",
    });
  });
});

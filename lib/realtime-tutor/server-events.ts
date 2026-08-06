import {
  activateRealtimeResponse,
  createRealtimeResponseState,
  finishRealtimeResponse,
  finishRealtimeResponseAudio,
  isActiveLogicalResponse,
  ownsRealtimeContinuation,
  requestRealtimeContinuation,
  startRealtimeResponseAudio,
} from "@/lib/realtime-response-state";
import {
  playRemoteAudio,
  startTutorAudioCapture,
  stopTutorAudioCapture,
} from "@/lib/realtime-tutor/audio";
import {
  resolveServerEvent,
  sendEvent,
  sendEventAndWait,
} from "@/lib/realtime-tutor/event-transport";
import { commitTutorTranscript } from "@/lib/realtime-tutor/lifecycle";
import { setGuidedSegmentCompletion } from "@/lib/realtime-tutor/progression";
import { sendToolOutputs } from "@/lib/realtime-tutor/tool-execution";
import type {
  RealtimeServerEvent,
  RealtimeTutorRuntime,
} from "@/lib/realtime-tutor/types";
import {
  getErrorMessage,
  readFunctionCalls,
  rejectPendingServerEvent,
} from "@/lib/realtime-tutor/transport";

export async function handleServerEvent(
  runtime: RealtimeTutorRuntime,
  rawEvent: unknown,
) {
  if (typeof rawEvent !== "string") {
    return;
  }

  let event: RealtimeServerEvent;

  try {
    event = JSON.parse(rawEvent) as RealtimeServerEvent;
  } catch {
    return;
  }

  if (event.type === "error") {
    handleRealtimeError(runtime, event);
    return;
  }

  resolveServerEvent(runtime, event);

  switch (event.type) {
    case "response.created":
      handleResponseCreated(runtime, event);
      return;
    case "output_audio_buffer.started":
      handleAudioStarted(runtime, event);
      return;
    case "response.output_audio_transcript.delta":
      handleTranscriptDelta(runtime, event);
      return;
    case "response.output_audio_transcript.done":
      handleTranscriptDone(runtime, event);
      return;
    case "output_audio_buffer.stopped":
      handleAudioFinished(runtime, event, true);
      return;
    case "output_audio_buffer.cleared":
      handleAudioFinished(runtime, event, false);
      return;
    case "response.done":
      await handleResponseDone(runtime, event);
      return;
    default:
      return;
  }
}

function handleRealtimeError(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
) {
  const realtimeError = new Error(
    event.error?.message ?? "The Realtime tutor reported an error.",
  );

  rejectPendingServerEvent(
    runtime.pendingServerEventsRef.current,
    event.error?.event_id,
    realtimeError,
  );
  runtime.setIsSubmittingUserTurn(false);
  runtime.setIsTutorResponding(false);
  runtime.responseStateRef.current = createRealtimeResponseState();
  stopTutorAudioCapture(runtime, false);
  runtime.setIsTutorSpeaking(false);
  runtime.setError(realtimeError.message);
}

function handleResponseCreated(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
) {
  const responseId = event.response?.id;

  if (!responseId) {
    return;
  }

  const transition = activateRealtimeResponse(
    runtime.responseStateRef.current,
    responseId,
  );

  if (!transition.accepted) {
    return;
  }

  runtime.responseStateRef.current = transition.state;
  commitTutorTranscript(runtime);

  if (runtime.isUserTurnRef.current) {
    sendEvent(runtime, { type: "response.cancel" });
    runtime.responseStateRef.current = createRealtimeResponseState();
    runtime.setIsTutorResponding(false);
    return;
  }

  runtime.setIsTutorResponding(true);
  runtime.setError("");
}

function handleAudioStarted(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
) {
  if (!event.response_id) {
    return;
  }

  const transition = startRealtimeResponseAudio(
    runtime.responseStateRef.current,
    event.response_id,
  );

  if (!transition.accepted) {
    return;
  }

  runtime.responseStateRef.current = transition.state;

  if (runtime.isUserTurnRef.current) {
    sendEvent(runtime, { type: "output_audio_buffer.clear" });
    runtime.responseStateRef.current = finishRealtimeResponseAudio(
      runtime.responseStateRef.current,
      event.response_id,
    ).state;
    return;
  }

  startTutorAudioCapture(runtime);
  runtime.setIsTutorResponding(true);
  runtime.setIsTutorSpeaking(true);
  void playRemoteAudio(runtime);
}

function handleTranscriptDelta(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
) {
  if (
    event.response_id &&
    isActiveLogicalResponse(
      runtime.responseStateRef.current,
      event.response_id,
    ) &&
    event.delta
  ) {
    runtime.tutorTranscriptRef.current += event.delta;
    runtime.setCurrentTutorTranscript(
      runtime.tutorTranscriptRef.current,
    );
  }
}

function handleTranscriptDone(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
) {
  if (
    event.response_id &&
    isActiveLogicalResponse(
      runtime.responseStateRef.current,
      event.response_id,
    ) &&
    event.transcript
  ) {
    runtime.tutorTranscriptRef.current = event.transcript;
    runtime.setCurrentTutorTranscript(event.transcript);
  }
}

function handleAudioFinished(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
  saveCapture: boolean,
) {
  if (!event.response_id) {
    return;
  }

  const transition = finishRealtimeResponseAudio(
    runtime.responseStateRef.current,
    event.response_id,
  );

  if (!transition.accepted) {
    return;
  }

  runtime.responseStateRef.current = transition.state;
  stopTutorAudioCapture(runtime, saveCapture);
  runtime.setIsTutorSpeaking(false);
}

async function handleResponseDone(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
) {
  const responseId = event.response?.id;

  if (
    !responseId ||
    !isActiveLogicalResponse(
      runtime.responseStateRef.current,
      responseId,
    )
  ) {
    return;
  }

  if (event.response?.status === "cancelled") {
    resetResponse(runtime);
    return;
  }

  if (
    event.response?.status &&
    event.response.status !== "completed"
  ) {
    resetResponse(runtime);
    runtime.setError(
      event.response.status_details?.error?.message ??
        "The tutor response did not complete.",
    );
    return;
  }

  const functionCalls = readFunctionCalls(event.response?.output);
  const completion = finishRealtimeResponse(
    runtime.responseStateRef.current,
    responseId,
    functionCalls.length > 0,
  );

  runtime.responseStateRef.current = completion.state;

  if (functionCalls.length > 0) {
    await continueAfterToolCalls(runtime, responseId, functionCalls);
    return;
  }

  if (completion.kind === "guided_segment") {
    setGuidedSegmentCompletion(runtime, true);
  }

  runtime.setIsTutorResponding(false);
}

async function continueAfterToolCalls(
  runtime: RealtimeTutorRuntime,
  responseId: string,
  functionCalls: ReturnType<typeof readFunctionCalls>,
) {
  try {
    await sendToolOutputs(runtime, functionCalls);
    const continuation = requestRealtimeContinuation(
      runtime.responseStateRef.current,
      responseId,
    );

    if (!continuation.accepted) {
      return;
    }

    runtime.responseStateRef.current = continuation.state;
    await sendEventAndWait(
      runtime,
      { type: "response.create" },
      "response.created",
    );
  } catch (reason) {
    if (
      !ownsRealtimeContinuation(
        runtime.responseStateRef.current,
        responseId,
      )
    ) {
      return;
    }

    resetResponse(runtime);
    runtime.setError(
      getErrorMessage(
        reason,
        "The tutor could not retrieve document context.",
      ),
    );
  }
}

function resetResponse(runtime: RealtimeTutorRuntime) {
  runtime.responseStateRef.current = createRealtimeResponseState();
  stopTutorAudioCapture(runtime, false);
  runtime.setIsTutorResponding(false);
  runtime.setIsTutorSpeaking(false);
}

import { createRealtimeResponseState, supersedeRealtimeResponse } from "@/lib/realtime-response-state";
import {
  clearTutorReplayAudio,
  stopTutorAudioCapture,
  stopTutorAudioReplay,
} from "@/lib/realtime-tutor/audio";
import {
  clearSelectionContext,
  syncSelectionContext,
} from "@/lib/realtime-tutor/context";
import {
  sendEvent,
  sendEventAndWait,
} from "@/lib/realtime-tutor/event-transport";
import {
  buildExplanationStyleReminder,
  buildGuidedQuestionInstructions,
  buildLearningAttemptEvaluationInstructions,
} from "@/lib/realtime-tutor/instructions";
import type {
  RealtimeTutorRuntime,
  RealtimeTutorStatus,
} from "@/lib/realtime-tutor/types";
import {
  getErrorMessage,
  setAudioTracksEnabled,
} from "@/lib/realtime-tutor/transport";
import { setGuidedSegmentCompletion } from "@/lib/realtime-tutor/progression";

export async function toggleUserTurn(
  runtime: RealtimeTutorRuntime,
  status: RealtimeTutorStatus,
  isSubmittingUserTurn: boolean,
) {
  if (
    status !== "connected" ||
    isSubmittingUserTurn ||
    runtime.userTurnTransitionRef.current
  ) {
    return false;
  }

  runtime.userTurnTransitionRef.current = true;

  try {
    if (runtime.isUserTurnRef.current) {
      return await finishUserTurn(runtime);
    }

    return await beginUserTurn(runtime);
  } finally {
    runtime.userTurnTransitionRef.current = false;
  }
}

async function beginUserTurn(runtime: RealtimeTutorRuntime) {
  const {
    documentModel,
    selection,
    relatedPagesLoading,
  } = runtime.optionsRef.current;
  const guided =
    runtime.sessionModeRef.current === "guided" ||
    runtime.sessionModeRef.current === "review";

  if (!documentModel || (!guided && !selection)) {
    runtime.setError("Draw a rectangle around something before asking.");
    return false;
  }

  const learningAttempt = Boolean(
    runtime.activeLearningCheckpointRef.current,
  );

  if (selection?.text && relatedPagesLoading && !learningAttempt) {
    runtime.setError("Wait for the related pages to finish loading.");
    return false;
  }

  const remoteAudio = runtime.remoteAudioRef.current;

  stopTutorAudioReplay(runtime);

  if (remoteAudio) {
    remoteAudio.muted = true;
  }

  runtime.isUserTurnRef.current = true;

  try {
    await sendEventAndWait(
      runtime,
      { type: "input_audio_buffer.clear" },
      "input_audio_buffer.cleared",
    );

    const activeLogicalResponse =
      runtime.responseStateRef.current.logical;
    const activeAudioResponse = runtime.responseStateRef.current.audio;

    if (activeLogicalResponse) {
      sendEvent(runtime, { type: "response.cancel" });
    }

    if (activeAudioResponse) {
      if (activeAudioResponse.kind === "guided_segment") {
        setGuidedSegmentCompletion(runtime, false);
      }

      sendEvent(runtime, { type: "output_audio_buffer.clear" });
      stopTutorAudioCapture(runtime, false);
    }

    runtime.responseStateRef.current = createRealtimeResponseState();

    if (selection && !learningAttempt) {
      await syncSelectionContext(runtime, documentModel, selection);
    } else {
      await clearSelectionContext(runtime);
    }
    setAudioTracksEnabled(runtime.mediaStreamRef.current, true);
    runtime.setIsUserTurn(true);
    runtime.setIsTutorResponding(false);
    runtime.setIsTutorSpeaking(false);
    runtime.setError("");
    return true;
  } catch (reason) {
    runtime.isUserTurnRef.current = false;

    if (remoteAudio) {
      remoteAudio.muted = false;
    }

    runtime.setIsUserTurn(false);
    runtime.setError(
      getErrorMessage(reason, "The learner turn could not start."),
    );
    return false;
  }
}

async function finishUserTurn(runtime: RealtimeTutorRuntime) {
  const {
    documentModel,
    selection,
    explanationStyle,
  } = runtime.optionsRef.current;

  if (!documentModel) {
    runtime.setError("The active document is unavailable.");
    return false;
  }

  setAudioTracksEnabled(runtime.mediaStreamRef.current, false);
  runtime.isUserTurnRef.current = false;
  runtime.setIsUserTurn(false);
  runtime.setIsSubmittingUserTurn(true);

  if (runtime.remoteAudioRef.current) {
    runtime.remoteAudioRef.current.muted = false;
  }

  try {
    await sendEventAndWait(
      runtime,
      { type: "input_audio_buffer.commit" },
      "input_audio_buffer.committed",
    );
    runtime.responseStateRef.current = supersedeRealtimeResponse(
      "learner_question",
    );
    const guidedSegment = runtime.guidedSegmentStateRef.current;
    const learningCheckpoint =
      runtime.activeLearningCheckpointRef.current;
    await sendEventAndWait(
      runtime,
      {
        type: "response.create",
        response: {
          instructions: learningCheckpoint
            ? buildLearningAttemptEvaluationInstructions(
                learningCheckpoint,
                explanationStyle,
              )
            : runtime.sessionModeRef.current === "guided"
              ? buildGuidedQuestionInstructions(
                  documentModel,
                  guidedSegment?.pageIndex ?? null,
                  guidedSegment?.segmentIndex ?? null,
                  Boolean(selection),
                  explanationStyle,
                )
              : `Answer the learner's latest spoken question about the active selection.
${buildExplanationStyleReminder(explanationStyle)}
Follow the session response policy and stop after the answer.`,
        },
      },
      "response.created",
    );
    runtime.setError("");
    return true;
  } catch (reason) {
    runtime.responseStateRef.current = createRealtimeResponseState();
    runtime.setIsTutorResponding(false);
    runtime.setError(
      getErrorMessage(reason, "The learner turn could not be submitted."),
    );
    return false;
  } finally {
    runtime.setIsSubmittingUserTurn(false);
  }
}

export function cancelTutorOutput(runtime: RealtimeTutorRuntime) {
  stopTutorAudioCapture(runtime, false);
  clearTutorReplayAudio(runtime);
  setAudioTracksEnabled(runtime.mediaStreamRef.current, false);
  runtime.isUserTurnRef.current = false;
  runtime.setIsUserTurn(false);
  runtime.setIsSubmittingUserTurn(false);

  if (runtime.remoteAudioRef.current) {
    runtime.remoteAudioRef.current.muted = false;
  }

  if (runtime.responseStateRef.current.logical) {
    sendEvent(runtime, { type: "response.cancel" });
  }

  if (runtime.responseStateRef.current.audio) {
    sendEvent(runtime, { type: "output_audio_buffer.clear" });
  }

  runtime.responseStateRef.current = createRealtimeResponseState();
  runtime.setIsTutorResponding(false);
  runtime.setIsTutorSpeaking(false);
}

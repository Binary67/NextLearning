import { createRealtimeResponseState } from "@/lib/realtime-response-state";
import {
  clearTutorReplayAudio,
  stopTutorAudioCapture,
} from "@/lib/realtime-tutor/audio";
import { postLearningSession } from "@/lib/realtime-tutor/persistence";
import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";
import {
  getErrorMessage,
  rejectPendingServerEvents,
} from "@/lib/realtime-tutor/transport";

export function closeConnection(runtime: RealtimeTutorRuntime) {
  stopTutorAudioCapture(runtime, false);
  clearTutorReplayAudio(runtime);
  rejectPendingServerEvents(
    runtime.pendingServerEventsRef.current,
    new Error("The Realtime tutor connection closed."),
  );
  runtime.dataChannelRef.current?.close();
  runtime.peerConnectionRef.current?.close();

  for (const track of runtime.mediaStreamRef.current?.getTracks() ?? []) {
    track.stop();
  }

  if (runtime.remoteAudioRef.current) {
    runtime.remoteAudioRef.current.srcObject = null;
  }

  runtime.dataChannelRef.current = null;
  runtime.peerConnectionRef.current = null;
  runtime.mediaStreamRef.current = null;
  runtime.remoteAudioRef.current = null;
  runtime.isUserTurnRef.current = false;
  runtime.userTurnTransitionRef.current = false;
  runtime.responseStateRef.current = createRealtimeResponseState();
  runtime.selectionContextItemRef.current = null;
  runtime.activePageContextItemRef.current = null;
  runtime.auxiliaryPageContextItemRef.current = null;
  runtime.sessionModeRef.current = null;
  runtime.guidedTutorModeRef.current = null;
  runtime.activeTutorSessionRef.current = null;
  runtime.guidedSegmentStateRef.current = null;
  runtime.activeLearningCheckpointRef.current = null;
  runtime.checkpointedConceptIdsRef.current = new Set();
}

export function clearTurnState(runtime: RealtimeTutorRuntime) {
  runtime.isUserTurnRef.current = false;
  runtime.setIsUserTurn(false);
  runtime.setIsSubmittingUserTurn(false);
  runtime.setIsTutorResponding(false);
  runtime.setIsTutorSpeaking(false);
}

export function clearTranscript(runtime: RealtimeTutorRuntime) {
  runtime.tutorTranscriptRef.current = "";
  runtime.setCurrentTutorTranscript("");
  runtime.setTutorTranscriptHistory([]);
}

export function commitTutorTranscript(runtime: RealtimeTutorRuntime) {
  const completedTranscript = runtime.tutorTranscriptRef.current.trim();

  if (completedTranscript) {
    runtime.setTutorTranscriptHistory((history) => [
      ...history,
      completedTranscript,
    ]);
  }

  runtime.tutorTranscriptRef.current = "";
  runtime.setCurrentTutorTranscript("");
}

export function failConnection(
  runtime: RealtimeTutorRuntime,
  dataChannel: RTCDataChannel,
  message: string,
) {
  if (runtime.dataChannelRef.current !== dataChannel) {
    return;
  }

  closeConnection(runtime);
  runtime.setGuidedSegmentProgress(null);
  runtime.setStatus("error");
  clearTurnState(runtime);
  runtime.setError(message);
}

export async function endSession(runtime: RealtimeTutorRuntime) {
  const tutorSession = runtime.activeTutorSessionRef.current;
  const documentId = runtime.optionsRef.current.documentId;

  closeConnection(runtime);
  runtime.setGuidedSegmentProgress(null);
  runtime.setStatus("ended");
  clearTurnState(runtime);
  clearTranscript(runtime);
  runtime.setError("");

  if (!tutorSession || !documentId) {
    return;
  }

  try {
    await postLearningSession(documentId, {
      id: tutorSession.id,
      mode: tutorSession.mode,
      startedAt: tutorSession.startedAt,
      endedAt: new Date().toISOString(),
      conceptsPracticed: [...tutorSession.conceptsPracticed],
    });
    runtime.setPersistenceError("");
  } catch (reason) {
    runtime.setPersistenceError(
      getErrorMessage(
        reason,
        "This session summary could not be saved.",
      ),
    );
  }
}

export function resetSession(runtime: RealtimeTutorRuntime) {
  closeConnection(runtime);
  runtime.setGuidedSegmentProgress(null);
  runtime.setStatus("idle");
  clearTurnState(runtime);
  clearTranscript(runtime);
  runtime.setError("");
}

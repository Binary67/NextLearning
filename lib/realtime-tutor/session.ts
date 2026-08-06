import { createRealtimeResponseState } from "@/lib/realtime-response-state";
import {
  learningRealtimeTutorTools,
  realtimeTutorTools,
} from "@/lib/realtime-tutor/tools";
import { sendEventAndWait, waitForServerEvent } from "@/lib/realtime-tutor/event-transport";
import { buildTutorInstructions } from "@/lib/realtime-tutor/instructions";
import {
  clearTranscript,
  clearTurnState,
  closeConnection,
  failConnection,
} from "@/lib/realtime-tutor/lifecycle";
import type {
  GuidedTutorMode,
  RealtimeTutorRuntime,
  RealtimeTutorStatus,
  TutorSessionMode,
} from "@/lib/realtime-tutor/types";
import {
  buildAudioConstraints,
  getErrorMessage,
  readResponseMessage,
  setAudioTracksEnabled,
  waitForDataChannel,
} from "@/lib/realtime-tutor/transport";
import { playRemoteAudio } from "@/lib/realtime-tutor/audio";

export async function startSession(
  runtime: RealtimeTutorRuntime,
  status: RealtimeTutorStatus,
  mode: TutorSessionMode,
  guidedTutorMode: GuidedTutorMode | null,
  handleServerEvent: (event: unknown) => Promise<void>,
) {
  if (status === "connecting" || status === "connected") {
    return false;
  }

  const {
    documentId,
    documentModel,
    explanationStyle,
    audioInputDeviceId,
    audioOutputDeviceId,
  } = runtime.optionsRef.current;

  if (!documentId || !documentModel) {
    runtime.setError("A prepared document is required.");
    runtime.setStatus("error");
    return;
  }

  runtime.setStatus("connecting");
  clearTurnState(runtime);
  clearTranscript(runtime);
  runtime.setError("");
  runtime.setPersistenceError("");
  runtime.sessionModeRef.current = mode;
  runtime.guidedTutorModeRef.current = guidedTutorMode;
  runtime.activeTutorSessionRef.current = {
    id: crypto.randomUUID(),
    mode,
    startedAt: new Date().toISOString(),
    conceptsPracticed: new Set(),
  };
  runtime.guidedSegmentStateRef.current = null;
  runtime.activeLearningCheckpointRef.current = null;
  runtime.checkpointedConceptIdsRef.current = new Set();
  runtime.responseStateRef.current = createRealtimeResponseState();
  runtime.setGuidedSegmentProgress(null);

  try {
    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;

    if (audioOutputDeviceId) {
      await remoteAudio.setSinkId(audioOutputDeviceId);
    }

    const peerConnection = new RTCPeerConnection();
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(audioInputDeviceId),
    });
    const dataChannel = peerConnection.createDataChannel("oai-events");

    peerConnection.ontrack = (event) => {
      remoteAudio.srcObject =
        event.streams[0] ?? new MediaStream([event.track]);
      void playRemoteAudio(runtime);
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "failed") {
        failConnection(
          runtime,
          dataChannel,
          "The Realtime tutor connection failed.",
        );
      }
    };

    setAudioTracksEnabled(mediaStream, false);

    for (const track of mediaStream.getTracks()) {
      peerConnection.addTrack(track, mediaStream);
    }

    runtime.peerConnectionRef.current = peerConnection;
    runtime.dataChannelRef.current = dataChannel;
    runtime.mediaStreamRef.current = mediaStream;
    runtime.remoteAudioRef.current = remoteAudio;

    const dataChannelOpened = waitForDataChannel(dataChannel);
    dataChannel.addEventListener("message", (event) => {
      void handleServerEvent(event.data);
    });
    dataChannel.addEventListener("close", () => {
      failConnection(
        runtime,
        dataChannel,
        "The Realtime tutor data channel closed.",
      );
    });
    dataChannel.addEventListener("error", () => {
      failConnection(
        runtime,
        dataChannel,
        "The Realtime tutor data channel failed.",
      );
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const response = await fetch(
      `/api/tutorials/${documentId}/realtime/session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      },
    );
    const answerSdp = await response.text();

    if (!response.ok) {
      const responseError = readResponseMessage(answerSdp);
      throw new Error(
        responseError ?? "The Realtime tutor could not start.",
      );
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });
    const sessionCreated = waitForServerEvent(runtime, "session.created");

    await Promise.all([dataChannelOpened, sessionCreated]);
    await sendEventAndWait(
      runtime,
      {
        type: "session.update",
        session: {
          type: "realtime",
          instructions: buildTutorInstructions(
            documentModel,
            mode,
            guidedTutorMode,
            explanationStyle,
          ),
          tools:
            mode === "review" || guidedTutorMode === "learning"
              ? learningRealtimeTutorTools
              : realtimeTutorTools,
          tool_choice: "auto",
        },
      },
      "session.updated",
    );
    runtime.setStatus("connected");
    return true;
  } catch (reason) {
    closeConnection(runtime);
    runtime.setError(
      getErrorMessage(reason, "The Realtime tutor could not start."),
    );
    runtime.setStatus("error");
    clearTurnState(runtime);
    clearTranscript(runtime);
    return false;
  }
}

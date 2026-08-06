import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";
import {
  buildAudioConstraints,
  getErrorMessage,
  setAudioTracksEnabled,
} from "@/lib/realtime-tutor/transport";

export function stopTutorAudioReplay(runtime: RealtimeTutorRuntime) {
  const replayAudio = runtime.tutorReplayAudioRef.current;

  if (replayAudio) {
    replayAudio.pause();
    replayAudio.currentTime = 0;
  }

  runtime.setIsReplayingTutorAudio(false);
}

export function clearTutorReplayAudio(runtime: RealtimeTutorRuntime) {
  stopTutorAudioReplay(runtime);

  if (runtime.tutorReplayAudioRef.current) {
    runtime.tutorReplayAudioRef.current.src = "";
    runtime.tutorReplayAudioRef.current = null;
  }

  if (runtime.tutorReplayUrlRef.current) {
    URL.revokeObjectURL(runtime.tutorReplayUrlRef.current);
    runtime.tutorReplayUrlRef.current = null;
  }

  runtime.setCanReplayTutorAudio(false);
}

export function stopTutorAudioCapture(
  runtime: RealtimeTutorRuntime,
  saveOnStop: boolean,
) {
  const capture = runtime.tutorAudioCaptureRef.current;

  if (!capture) {
    return;
  }

  if (!saveOnStop) {
    capture.discarded = true;
  }

  capture.saveOnStop = saveOnStop && !capture.discarded;

  if (capture.recorder.state !== "inactive") {
    capture.recorder.stop();
  }
}

export function startTutorAudioCapture(runtime: RealtimeTutorRuntime) {
  stopTutorAudioCapture(runtime, false);
  clearTutorReplayAudio(runtime);

  const remoteStream = runtime.remoteAudioRef.current?.srcObject;

  if (!(remoteStream instanceof MediaStream)) {
    return;
  }

  try {
    const recorder = new MediaRecorder(remoteStream);
    const capture = {
      recorder,
      chunks: [] as Blob[],
      discarded: false,
      saveOnStop: false,
    };

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        capture.chunks.push(event.data);
      }
    });
    recorder.addEventListener("error", () => {
      capture.discarded = true;
    });
    recorder.addEventListener("stop", () => {
      if (runtime.tutorAudioCaptureRef.current === capture) {
        runtime.tutorAudioCaptureRef.current = null;
      }

      if (
        capture.discarded ||
        !capture.saveOnStop ||
        capture.chunks.length === 0
      ) {
        return;
      }

      const replayUrl = URL.createObjectURL(
        new Blob(capture.chunks, { type: recorder.mimeType }),
      );
      const replayAudio = new Audio(replayUrl);

      replayAudio.preload = "auto";
      replayAudio.addEventListener("ended", () => {
        if (runtime.tutorReplayAudioRef.current === replayAudio) {
          runtime.setIsReplayingTutorAudio(false);
        }
      });
      runtime.tutorReplayUrlRef.current = replayUrl;
      runtime.tutorReplayAudioRef.current = replayAudio;
      runtime.setCanReplayTutorAudio(true);
    });
    runtime.tutorAudioCaptureRef.current = capture;
    recorder.start();
  } catch {
    runtime.tutorAudioCaptureRef.current = null;
  }
}

export async function replayTutorAudio(runtime: RealtimeTutorRuntime) {
  const replayAudio = runtime.tutorReplayAudioRef.current;

  if (
    !replayAudio ||
    runtime.responseStateRef.current.logical ||
    runtime.responseStateRef.current.audio ||
    runtime.isUserTurnRef.current
  ) {
    return false;
  }

  try {
    stopTutorAudioReplay(runtime);

    if (runtime.optionsRef.current.audioOutputDeviceId) {
      await replayAudio.setSinkId(
        runtime.optionsRef.current.audioOutputDeviceId,
      );
    }

    runtime.setIsReplayingTutorAudio(true);
    await replayAudio.play();
    runtime.setError("");
    return true;
  } catch (reason) {
    runtime.setIsReplayingTutorAudio(false);
    runtime.setError(
      getErrorMessage(reason, "The tutor audio could not be replayed."),
    );
    return false;
  }
}

export async function selectAudioInputDevice(
  runtime: RealtimeTutorRuntime,
  status: string,
  deviceId: string,
) {
  if (status !== "connected") {
    return true;
  }

  const audioSender = runtime.peerConnectionRef.current
    ?.getSenders()
    .find((sender) => sender.track?.kind === "audio");

  if (!audioSender) {
    runtime.setError("The active microphone connection is unavailable.");
    return false;
  }

  let replacementStream: MediaStream | null = null;

  try {
    replacementStream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId),
    });
    const replacementTrack = replacementStream.getAudioTracks()[0];

    if (!replacementTrack) {
      throw new Error("The selected microphone did not provide audio.");
    }

    setAudioTracksEnabled(
      replacementStream,
      runtime.isUserTurnRef.current,
    );
    await audioSender.replaceTrack(replacementTrack);

    for (const track of runtime.mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }

    runtime.mediaStreamRef.current = replacementStream;
    runtime.setError("");
    return true;
  } catch (reason) {
    for (const track of replacementStream?.getTracks() ?? []) {
      track.stop();
    }

    runtime.setError(
      getErrorMessage(reason, "The microphone could not be changed."),
    );
    return false;
  }
}

export async function selectAudioOutputDevice(
  runtime: RealtimeTutorRuntime,
  deviceId: string,
) {
  const remoteAudio = runtime.remoteAudioRef.current;

  if (!remoteAudio) {
    return true;
  }

  try {
    await remoteAudio.setSinkId(deviceId);
    runtime.setError("");
    return true;
  } catch (reason) {
    runtime.setError(
      getErrorMessage(reason, "The speaker could not be changed."),
    );
    return false;
  }
}

export async function playRemoteAudio(runtime: RealtimeTutorRuntime) {
  const remoteAudio = runtime.remoteAudioRef.current;

  if (!remoteAudio?.srcObject || !remoteAudio.paused) {
    return;
  }

  try {
    await remoteAudio.play();
  } catch {
    runtime.setError(
      "Tutor audio playback was blocked. Allow audio autoplay and start the session again.",
    );
  }
}

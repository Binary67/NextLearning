"use client";

import { useCallback, useEffect } from "react";

import type { ReviewCheckpoint } from "@/lib/learning-checkpoints";
import {
  replayTutorAudio as replayCapturedTutorAudio,
  selectAudioInputDevice as changeAudioInputDevice,
  selectAudioOutputDevice as changeAudioOutputDevice,
} from "@/lib/realtime-tutor/audio";
import {
  continueGuided as continueGuidedSession,
  explainPage as explainGuidedPage,
  startGuided as startGuidedSession,
  startReview as startReviewSession,
} from "@/lib/realtime-tutor/guided";
import {
  closeConnection,
  endSession,
  resetSession,
} from "@/lib/realtime-tutor/lifecycle";
import { requestTechnicalLessonAction as requestLessonAction } from "@/lib/realtime-tutor/lesson-actions";
import {
  createLearnerRequestedLearningVisual,
} from "@/lib/realtime-tutor/learning-visual";
import { useRealtimeTutorRuntime } from "@/lib/realtime-tutor/runtime";
import { handleServerEvent as processServerEvent } from "@/lib/realtime-tutor/server-events";
import { startSession as connectSession } from "@/lib/realtime-tutor/session";
import {
  cancelTutorOutput,
  toggleUserTurn as toggleLearnerTurn,
} from "@/lib/realtime-tutor/turns";
import type {
  GuidedTutorMode,
  RealtimeTutorOptions,
  TechnicalLessonAction,
  TutorSessionMode,
} from "@/lib/realtime-tutor/types";

export type {
  ExplanationStyle,
  GuidedSegmentProgress,
  GuidedTutorMode,
  LearningVisualState,
  RealtimeTutorStatus,
  TechnicalLessonAction,
} from "@/lib/realtime-tutor/types";

export function useRealtimeTutor(options: RealtimeTutorOptions) {
  const {
    runtime,
    status,
    isUserTurn,
    isSubmittingUserTurn,
    isTutorResponding,
    isTutorSpeaking,
    canReplayTutorAudio,
    isReplayingTutorAudio,
    currentTutorTranscript,
    tutorTranscriptHistory,
    guidedSegmentProgress,
    error,
    persistenceError,
    learningVisualState,
  } = useRealtimeTutorRuntime(options);

  const close = useCallback(() => {
    closeConnection(runtime);
  }, [runtime]);

  useEffect(
    () => () => {
      close();
    },
    [close],
  );

  async function handleServerEvent(event: unknown) {
    await processServerEvent(runtime, event);
  }

  async function startSession(
    mode: TutorSessionMode,
    guidedTutorMode: GuidedTutorMode | null = null,
  ) {
    return connectSession(
      runtime,
      status,
      mode,
      guidedTutorMode,
      handleServerEvent,
    );
  }

  async function startGuided(
    pageIndex: number,
    chunkId: string | null,
    guidedTutorMode: GuidedTutorMode,
  ) {
    await startGuidedSession(
      runtime,
      startSession,
      pageIndex,
      chunkId,
      guidedTutorMode,
      () => cancelTutorOutput(runtime),
    );
  }

  async function startReview(review: ReviewCheckpoint) {
    await startReviewSession(
      runtime,
      startSession,
      review,
      () => cancelTutorOutput(runtime),
    );
  }

  function explainPage(pageIndex: number) {
    return explainGuidedPage(runtime, pageIndex, () =>
      cancelTutorOutput(runtime),
    );
  }

  function continueGuided() {
    return continueGuidedSession(
      runtime,
      status,
      isSubmittingUserTurn,
      () => cancelTutorOutput(runtime),
    );
  }

  function requestTechnicalLessonAction(
    action: TechnicalLessonAction,
    pageIndex: number,
  ): Promise<boolean> {
    return requestLessonAction(
      runtime,
      status,
      isSubmittingUserTurn,
      action,
      pageIndex,
    );
  }

  function toggleUserTurn() {
    return toggleLearnerTurn(
      runtime,
      status,
      isSubmittingUserTurn,
    );
  }

  function replayTutorAudio() {
    return replayCapturedTutorAudio(runtime);
  }

  function selectAudioInputDevice(deviceId: string) {
    return changeAudioInputDevice(runtime, status, deviceId);
  }

  function selectAudioOutputDevice(deviceId: string) {
    return changeAudioOutputDevice(runtime, deviceId);
  }

  async function createLearningVisual(pageIndex: number) {
    try {
      await createLearnerRequestedLearningVisual(runtime, pageIndex);
    } catch {
      // The visual state contains the user-facing error.
    }
  }

  async function end() {
    await endSession(runtime);
  }

  function reset() {
    resetSession(runtime);
  }

  const tutorTranscripts = currentTutorTranscript
    ? [...tutorTranscriptHistory, currentTutorTranscript]
    : tutorTranscriptHistory;

  return {
    status,
    isUserTurn,
    isSubmittingUserTurn,
    isTutorResponding,
    isTutorSpeaking,
    canReplayTutorAudio,
    isReplayingTutorAudio,
    currentTutorTranscript,
    tutorTranscripts,
    guidedSegmentProgress,
    error,
    persistenceError,
    learningVisualState,
    startGuided,
    startReview,
    explainPage,
    continueGuided,
    requestTechnicalLessonAction,
    toggleUserTurn,
    replayTutorAudio,
    selectAudioInputDevice,
    selectAudioOutputDevice,
    createLearningVisual,
    end,
    reset,
  };
}

import { useEffect, useMemo, useRef, useState } from "react";

import { createRealtimeResponseState } from "@/lib/realtime-response-state";
import type {
  ActiveLearningCheckpoint,
  ActiveTutorSession,
  GuidedSegmentProgress,
  GuidedSegmentState,
  GuidedTutorMode,
  PageContextItem,
  PendingServerEvent,
  RealtimeTutorOptions,
  RealtimeTutorRuntime,
  RealtimeTutorStatus,
  SelectionContextItem,
  TutorAudioCapture,
  TutorSessionMode,
} from "@/lib/realtime-tutor/types";

export function useRealtimeTutorRuntime(options: RealtimeTutorOptions) {
  const [status, setStatus] = useState<RealtimeTutorStatus>("idle");
  const [isUserTurn, setIsUserTurn] = useState(false);
  const [isSubmittingUserTurn, setIsSubmittingUserTurn] = useState(false);
  const [isTutorResponding, setIsTutorResponding] = useState(false);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [canReplayTutorAudio, setCanReplayTutorAudio] = useState(false);
  const [isReplayingTutorAudio, setIsReplayingTutorAudio] =
    useState(false);
  const [currentTutorTranscript, setCurrentTutorTranscript] =
    useState("");
  const [tutorTranscriptHistory, setTutorTranscriptHistory] = useState<
    string[]
  >([]);
  const [guidedSegmentProgress, setGuidedSegmentProgress] =
    useState<GuidedSegmentProgress | null>(null);
  const [error, setError] = useState("");
  const [persistenceError, setPersistenceError] = useState("");
  const optionsRef = useRef(options);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const tutorAudioCaptureRef = useRef<TutorAudioCapture | null>(null);
  const tutorReplayAudioRef = useRef<HTMLAudioElement | null>(null);
  const tutorReplayUrlRef = useRef<string | null>(null);
  const isUserTurnRef = useRef(false);
  const userTurnTransitionRef = useRef(false);
  const responseStateRef = useRef(createRealtimeResponseState());
  const tutorTranscriptRef = useRef("");
  const selectionContextItemRef = useRef<SelectionContextItem | null>(
    null,
  );
  const activePageContextItemRef = useRef<PageContextItem | null>(null);
  const auxiliaryPageContextItemRef = useRef<PageContextItem | null>(
    null,
  );
  const sessionModeRef = useRef<TutorSessionMode | null>(null);
  const guidedTutorModeRef = useRef<GuidedTutorMode | null>(null);
  const activeTutorSessionRef = useRef<ActiveTutorSession | null>(null);
  const guidedSegmentStateRef = useRef<GuidedSegmentState | null>(null);
  const activeLearningCheckpointRef =
    useRef<ActiveLearningCheckpoint | null>(null);
  const checkpointedConceptIdsRef = useRef(new Set<string>());
  const pendingServerEventsRef = useRef(
    new Map<string, PendingServerEvent>(),
  );

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const runtime = useMemo<RealtimeTutorRuntime>(
    () => ({
      optionsRef,
      peerConnectionRef,
      dataChannelRef,
      mediaStreamRef,
      remoteAudioRef,
      tutorAudioCaptureRef,
      tutorReplayAudioRef,
      tutorReplayUrlRef,
      isUserTurnRef,
      userTurnTransitionRef,
      responseStateRef,
      tutorTranscriptRef,
      selectionContextItemRef,
      activePageContextItemRef,
      auxiliaryPageContextItemRef,
      sessionModeRef,
      guidedTutorModeRef,
      activeTutorSessionRef,
      guidedSegmentStateRef,
      activeLearningCheckpointRef,
      checkpointedConceptIdsRef,
      pendingServerEventsRef,
      setStatus,
      setIsUserTurn,
      setIsSubmittingUserTurn,
      setIsTutorResponding,
      setIsTutorSpeaking,
      setCanReplayTutorAudio,
      setIsReplayingTutorAudio,
      setCurrentTutorTranscript,
      setTutorTranscriptHistory,
      setGuidedSegmentProgress,
      setError,
      setPersistenceError,
    }),
    [],
  );

  return {
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
  };
}

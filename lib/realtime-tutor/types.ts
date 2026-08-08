import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { LearningVisual } from "@/lib/learning-visual";
import type {
  DocumentModel,
  TextSelectionContext,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";
import type {
  CheckpointSelection,
  LearningLoopState,
} from "@/lib/learning-checkpoints";
import type { GuidedSegmentContext } from "@/lib/guided-segment-context";
import type { createRealtimeResponseState } from "@/lib/realtime-response-state";

export type RealtimeTutorStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

export type ExplanationStyle = "plain" | "technical";
export type GuidedTutorMode = "reading" | "learning";

export type LearningVisualState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; visual: LearningVisual }
  | { status: "error"; message: string };

export type GuidedSegmentProgress = {
  pageIndex: number;
  chunkId: string | null;
  sectionTitle: string;
  title: string;
  sourceText: string;
  conceptName: string | null;
  learningPhase: LearningLoopState["phase"] | null;
  attemptNumber: LearningLoopState["attemptNumber"] | null;
  segmentNumber: number;
  segmentCount: number;
  segmentComplete: boolean;
  pageComplete: boolean;
};

export type RealtimeTutorOptions = {
  documentId: string | null;
  documentModel: DocumentModel | null;
  selection: DocumentSelection | null;
  textSelectionContext: TextSelectionContext | null;
  relatedPagesLoading: boolean;
  explanationStyle: ExplanationStyle;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
};

export type RealtimeServerEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  response_id?: string;
  item?: { id?: string };
  error?: {
    event_id?: string;
    message?: string;
  };
  response?: {
    id?: string;
    status?: string;
    status_details?: {
      error?: {
        message?: string;
      };
    };
    output?: RealtimeResponseOutputItem[];
  };
};

export type RealtimeResponseOutputItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

export type RealtimeFunctionCall = {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
};

export type PendingServerEvent = {
  eventId: string | null;
  resolve: (event: RealtimeServerEvent) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type SelectionContextItem = {
  key: string;
  itemId: string;
};

export type PageContextItem = {
  pageIndex: number;
  itemId: string;
};

export type TutorAudioCapture = {
  recorder: MediaRecorder;
  chunks: Blob[];
  discarded: boolean;
  saveOnStop: boolean;
};

export type TutorSessionMode = "guided" | "review";

export type GuidedSegmentState = {
  pageIndex: number;
  segmentIndex: number | null;
  complete: boolean;
};

export type ActiveLearningCheckpoint = {
  selection: CheckpointSelection;
  state: LearningLoopState;
  surroundingContext: GuidedSegmentContext | null;
};

export type ActiveTutorSession = {
  id: string;
  mode: TutorSessionMode;
  startedAt: string;
  conceptsPracticed: Set<string>;
};

export type RealtimeResponseState = ReturnType<
  typeof createRealtimeResponseState
>;

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type RealtimeTutorRuntime = {
  optionsRef: MutableRefObject<RealtimeTutorOptions>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  dataChannelRef: MutableRefObject<RTCDataChannel | null>;
  mediaStreamRef: MutableRefObject<MediaStream | null>;
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>;
  tutorAudioCaptureRef: MutableRefObject<TutorAudioCapture | null>;
  tutorReplayAudioRef: MutableRefObject<HTMLAudioElement | null>;
  tutorReplayUrlRef: MutableRefObject<string | null>;
  isUserTurnRef: MutableRefObject<boolean>;
  userTurnTransitionRef: MutableRefObject<boolean>;
  responseStateRef: MutableRefObject<RealtimeResponseState>;
  tutorTranscriptRef: MutableRefObject<string>;
  selectionContextItemRef: MutableRefObject<SelectionContextItem | null>;
  activePageContextItemRef: MutableRefObject<PageContextItem | null>;
  auxiliaryPageContextItemRef: MutableRefObject<PageContextItem | null>;
  sessionModeRef: MutableRefObject<TutorSessionMode | null>;
  guidedTutorModeRef: MutableRefObject<GuidedTutorMode | null>;
  activeTutorSessionRef: MutableRefObject<ActiveTutorSession | null>;
  guidedSegmentStateRef: MutableRefObject<GuidedSegmentState | null>;
  activeLearningCheckpointRef:
    MutableRefObject<ActiveLearningCheckpoint | null>;
  checkpointedConceptIdsRef: MutableRefObject<Set<string>>;
  pendingServerEventsRef: MutableRefObject<
    Map<string, PendingServerEvent>
  >;
  setStatus: StateSetter<RealtimeTutorStatus>;
  setIsUserTurn: StateSetter<boolean>;
  setIsSubmittingUserTurn: StateSetter<boolean>;
  setIsTutorResponding: StateSetter<boolean>;
  setIsTutorSpeaking: StateSetter<boolean>;
  setCanReplayTutorAudio: StateSetter<boolean>;
  setIsReplayingTutorAudio: StateSetter<boolean>;
  setCurrentTutorTranscript: StateSetter<string>;
  setTutorTranscriptHistory: StateSetter<string[]>;
  setGuidedSegmentProgress: StateSetter<GuidedSegmentProgress | null>;
  setError: StateSetter<string>;
  setPersistenceError: StateSetter<string>;
  setLearningVisualState: StateSetter<LearningVisualState>;
};

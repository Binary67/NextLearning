import {
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import type {
  DocumentModel,
  TextSelectionContext,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";
import type {
  GuidedSegmentProgress,
  GuidedTutorMode,
  RealtimeTutorStatus,
} from "@/lib/use-realtime-tutor";
import type { TechnicalLessonAction } from "@/lib/realtime-tutor/types";

import {
  GuidedProgressCard,
} from "./guided-progress-card";
import { RelatedPagesCard } from "./related-pages-card";
import {
  AskButton,
  renderGuidedContinueAction,
  renderSessionAction,
} from "./tutor-session-actions";
import type { TutorMode } from "./types";
import type { RelatedPagesStatus } from "./use-related-pages";
import { TutorResponseCard } from "./tutor-response-card";
import { technicalLessonActions } from "./technical-lesson-actions";

export function TutorSidebar({
  modeLabel,
  tutorMode,
  guidedTutorMode,
  sessionActive,
  guidedSessionActive,
  status,
  tutorError,
  reviewError,
  learningStateError,
  persistenceError,
  hasDocument,
  hasReviewTarget,
  selection,
  textSelectionContext,
  relatedPagesStatus,
  documentModel,
  guidedProgress,
  currentPage,
  hasNextPage,
  learnerCanAsk,
  learnerTurnPrompt,
  pdfInstruction,
  askButtonLabel,
  guidedTurnBusy,
  isUserTurn,
  isSubmittingUserTurn,
  isTutorResponding,
  isTutorSpeaking,
  learningVisualGenerating,
  canReplayTutorAudio,
  isReplayingTutorAudio,
  currentTutorTranscript,
  tutorTranscripts,
  onGuidedTutorModeChange,
  onToggleUserTurn,
  onStartTutor,
  onContinueGuided,
  onEndSession,
  onReplayAudio,
  onOpenTranscript,
  requestTechnicalLessonAction,
}: {
  modeLabel: string;
  tutorMode: TutorMode;
  guidedTutorMode: GuidedTutorMode;
  sessionActive: boolean;
  guidedSessionActive: boolean;
  status: RealtimeTutorStatus;
  tutorError: string;
  reviewError: string;
  learningStateError: string;
  persistenceError: string;
  hasDocument: boolean;
  hasReviewTarget: boolean;
  selection: DocumentSelection | null;
  textSelectionContext: TextSelectionContext | null;
  relatedPagesStatus: RelatedPagesStatus;
  documentModel: DocumentModel | null;
  guidedProgress: GuidedSegmentProgress | null;
  currentPage: number;
  hasNextPage: boolean;
  learnerCanAsk: boolean;
  learnerTurnPrompt: string;
  pdfInstruction: string;
  askButtonLabel: string;
  guidedTurnBusy: boolean;
  isUserTurn: boolean;
  isSubmittingUserTurn: boolean;
  isTutorResponding: boolean;
  isTutorSpeaking: boolean;
  learningVisualGenerating: boolean;
  canReplayTutorAudio: boolean;
  isReplayingTutorAudio: boolean;
  currentTutorTranscript: string;
  tutorTranscripts: string[];
  onGuidedTutorModeChange: (mode: GuidedTutorMode) => void;
  onToggleUserTurn: () => void;
  onStartTutor: () => void;
  onContinueGuided: () => void;
  onEndSession: () => void;
  onReplayAudio: () => void;
  onOpenTranscript: () => void;
  requestTechnicalLessonAction: (
    action: TechnicalLessonAction,
    pageIndex: number,
  ) => Promise<boolean>;
}) {
  const guidedMode = tutorMode === "guided";
  const reviewMode = tutorMode === "review";
  const activeLearningMode =
    guidedMode && guidedTutorMode === "learning";
  const tutorStatus = renderTutorStatus({
    status,
    tutorError,
    reviewMode,
    activeLearningMode,
    guidedTutorMode,
    guidedProgress,
    selection,
    learnerTurnPrompt,
    pdfInstruction,
    isSubmittingUserTurn,
    isUserTurn,
    isReplayingTutorAudio,
    isTutorResponding,
    isTutorSpeaking,
  });
  const sessionAction = renderSessionAction({
    status,
    reviewMode,
    guidedTutorMode,
    hasDocument,
    hasReviewTarget,
    onStartTutor,
    onEndSession,
  });
  const guidedContinueAction =
    guidedSessionActive && guidedProgress
      ? renderGuidedContinueAction(
          guidedProgress,
          guidedTurnBusy,
          hasNextPage,
          onContinueGuided,
        )
      : null;
  const guidedSessionStatus = guidedSessionActive ? (
    <>
      <div className="tutor-session-status">{tutorStatus}</div>
      {learningStateError || persistenceError ? (
        <p className="learning-persistence-error" role="status">
          {persistenceError || learningStateError}
        </p>
      ) : null}
    </>
  ) : null;
  const guidedSessionActions = guidedSessionActive ? (
    <>
      <AskButton
        isUserTurn={isUserTurn}
        isSubmittingUserTurn={isSubmittingUserTurn}
        learnerCanAsk={learnerCanAsk}
        label={askButtonLabel}
        onToggle={onToggleUserTurn}
      />
      {guidedContinueAction}
      {guidedProgress?.chunkId && !guidedProgress.learningPhase ? (
        <TechnicalLessonActions
          pageIndex={currentPage}
          disabled={guidedTurnBusy || learningVisualGenerating}
          requestTechnicalLessonAction={requestTechnicalLessonAction}
        />
      ) : null}
    </>
  ) : null;

  return (
    <aside
      className={`insights-column${sessionActive ? " session-active" : ""}${
        guidedSessionActive ? " guided-session-active" : ""
      }`}
      aria-label={`${modeLabel} workspace`}
    >
      <section
        className="insight-card tutor-session-card"
        hidden={guidedSessionActive}
      >
        <h2>
          <span className="insight-card-icon">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          {modeLabel}
        </h2>
        {guidedMode && !sessionActive ? (
          <>
            <div
              className="tutor-mode-selector guided-tutor-mode-selector"
              role="group"
              aria-label="Tutor approach"
            >
              <button
                className={
                  guidedTutorMode === "reading" ? "active" : undefined
                }
                type="button"
                onClick={() => onGuidedTutorModeChange("reading")}
                disabled={sessionActive}
                aria-pressed={guidedTutorMode === "reading"}
              >
                Guided reading
              </button>
              <button
                className={
                  guidedTutorMode === "learning" ? "active" : undefined
                }
                type="button"
                onClick={() => onGuidedTutorModeChange("learning")}
                disabled={sessionActive}
                aria-pressed={guidedTutorMode === "learning"}
              >
                Active learning
              </button>
            </div>
            <p className="guided-tutor-mode-description">
              {guidedTutorMode === "reading"
                ? "Teach the document page by page without testing me."
                : "Teach the document page by page and check my understanding."}
            </p>
          </>
        ) : null}
        <div className="tutor-session-status">{tutorStatus}</div>
        {reviewError ? (
          <p className="learning-persistence-error">{reviewError}</p>
        ) : null}
        {learningStateError || persistenceError ? (
          <p className="learning-persistence-error" role="status">
            {persistenceError || learningStateError}
          </p>
        ) : null}
        {status === "connected" ? (
          <AskButton
            isUserTurn={isUserTurn}
            isSubmittingUserTurn={isSubmittingUserTurn}
            learnerCanAsk={learnerCanAsk}
            label={askButtonLabel}
            onToggle={onToggleUserTurn}
          />
        ) : null}
        {sessionAction}
        {reviewMode &&
        (reviewError || status === "ended" || status === "error") ? (
          <Link className="secondary-button review-back-link" href="/review">
            Back to review
          </Link>
        ) : null}
      </section>

      {reviewMode ? (
        <GuidedProgressCard
          progress={guidedProgress}
          connected={status === "connected"}
          busy={guidedTurnBusy}
          hasNextPage={hasNextPage}
          review={reviewMode}
          guidedTutorMode={guidedTutorMode}
          onContinue={onContinueGuided}
        />
      ) : null}

      <TutorResponseCard
        transcript={currentTutorTranscript}
        history={tutorTranscripts}
        isStreaming={isTutorResponding || isTutorSpeaking}
        canReplayAudio={canReplayTutorAudio}
        isReplayingAudio={isReplayingTutorAudio}
        sessionStatus={guidedSessionStatus}
        sessionActions={guidedSessionActions}
        onReplayAudio={onReplayAudio}
        onOpen={onOpenTranscript}
      />

      {selection && !guidedSessionActive ? (
        <RelatedPagesCard
          selection={selection}
          model={documentModel}
          context={textSelectionContext}
          status={relatedPagesStatus}
        />
      ) : null}
    </aside>
  );
}

function TechnicalLessonActions({
  pageIndex,
  disabled,
  requestTechnicalLessonAction,
}: {
  pageIndex: number;
  disabled: boolean;
  requestTechnicalLessonAction: (
    action: TechnicalLessonAction,
    pageIndex: number,
  ) => Promise<boolean>;
}) {
  const [pendingAction, setPendingAction] =
    useState<TechnicalLessonAction | null>(null);
  const pendingActionRef = useRef<TechnicalLessonAction | null>(null);

  async function requestAction(action: TechnicalLessonAction) {
    if (disabled || pendingActionRef.current !== null) {
      return;
    }

    pendingActionRef.current = action;
    setPendingAction(action);

    try {
      await requestTechnicalLessonAction(action, pageIndex);
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }

  return (
    <div
      className="technical-lesson-actions"
      role="group"
      aria-labelledby="technical-lesson-actions-label"
      aria-busy={pendingAction !== null}
    >
      <span
        className="technical-lesson-actions-label"
        id="technical-lesson-actions-label"
      >
        More ways to learn
      </span>
      <div className="technical-lesson-action-grid">
        {technicalLessonActions.map(({ action, label }) => (
          <button
            className="secondary-button technical-lesson-action"
            type="button"
            key={action}
            onClick={() => void requestAction(action)}
            disabled={disabled || pendingAction !== null}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function renderTutorStatus({
  status,
  tutorError,
  reviewMode,
  activeLearningMode,
  guidedTutorMode,
  guidedProgress,
  selection,
  learnerTurnPrompt,
  pdfInstruction,
  isSubmittingUserTurn,
  isUserTurn,
  isReplayingTutorAudio,
  isTutorResponding,
  isTutorSpeaking,
}: {
  status: RealtimeTutorStatus;
  tutorError: string;
  reviewMode: boolean;
  activeLearningMode: boolean;
  guidedTutorMode: GuidedTutorMode;
  guidedProgress: GuidedSegmentProgress | null;
  selection: DocumentSelection | null;
  learnerTurnPrompt: string;
  pdfInstruction: string;
  isSubmittingUserTurn: boolean;
  isUserTurn: boolean;
  isReplayingTutorAudio: boolean;
  isTutorResponding: boolean;
  isTutorSpeaking: boolean;
}) {
  if (status === "connecting") {
    return (
      <TurnState eyebrow="Connecting">
        {`Connecting and preparing this ${
          reviewMode ? "review" : "page"
        }…`}
      </TurnState>
    );
  }

  if (status === "connected") {
    if (isSubmittingUserTurn) {
      return <TurnState eyebrow="Your turn">Sending your response…</TurnState>;
    }

    if (isUserTurn) {
      return (
        <span className="turn-state-copy">
          <small className="listening-label">
            <span className="listening-dot" aria-hidden="true" />
            Listening
          </small>
          <strong>
            {guidedProgress?.learningPhase
              ? "Answer the active learning question"
              : selection
                ? "Ask about the selected region"
                : reviewMode
                  ? "Answer the review question"
                  : "Ask about this page"}
          </strong>
        </span>
      );
    }

    if (isReplayingTutorAudio) {
      return <TurnState eyebrow="Tutor audio">Replaying tutor audio…</TurnState>;
    }

    if (isTutorResponding || isTutorSpeaking) {
      const activity = isTutorSpeaking
        ? "Speaking…"
        : reviewMode || activeLearningMode
          ? "Tutoring…"
          : "Explaining…";

      return <TurnState eyebrow="Tutor">{activity}</TurnState>;
    }

    return <TurnState eyebrow="Your turn">{learnerTurnPrompt}</TurnState>;
  }

  if (status === "error") {
    return (
      <TurnState eyebrow="Tutor unavailable" error>
        {tutorError}
      </TurnState>
    );
  }

  if (status === "ended") {
    return <TurnState eyebrow="Session">Session ended</TurnState>;
  }

  return (
    <TurnState eyebrow="Ready">
      {reviewMode
        ? pdfInstruction
        : guidedTutorMode === "reading"
          ? "Read this document with page-by-page explanations"
          : "Learn this document page by page"}
    </TurnState>
  );
}

function TurnState({
  eyebrow,
  error = false,
  children,
}: {
  eyebrow: ReactNode;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`turn-state-copy${error ? " error" : ""}`}>
      <small>{eyebrow}</small>
      <strong>{children}</strong>
    </span>
  );
}

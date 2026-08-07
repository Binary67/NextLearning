import {
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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
                ? "Explain each section without testing me."
                : "Explain each section and check my understanding."}
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
          ? "Read this paper with section-by-section explanations"
          : "Learn this paper step by step"}
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

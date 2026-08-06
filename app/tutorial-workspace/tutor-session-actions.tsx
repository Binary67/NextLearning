import { Check, ChevronRight, Hand, LogOut, Play } from "lucide-react";
import type { ReactNode } from "react";

import type {
  GuidedSegmentProgress,
  GuidedTutorMode,
  RealtimeTutorStatus,
} from "@/lib/use-realtime-tutor";

import { getGuidedContinueButtonLabel } from "./guided-progress-card";

export function AskButton({
  isUserTurn,
  isSubmittingUserTurn,
  learnerCanAsk,
  label,
  onToggle,
}: {
  isUserTurn: boolean;
  isSubmittingUserTurn: boolean;
  learnerCanAsk: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={`secondary-button tutor-ask-button${
        isUserTurn ? " user-turn" : ""
      }`}
      type="button"
      onClick={onToggle}
      disabled={isSubmittingUserTurn || !learnerCanAsk}
    >
      {isUserTurn ? <Check size={18} /> : <Hand size={18} />}
      {label}
    </button>
  );
}

export function renderSessionAction({
  status,
  reviewMode,
  guidedMode,
  guidedTutorMode,
  hasDocument,
  hasReviewTarget,
  onStartTutor,
  onEndSession,
}: {
  status: RealtimeTutorStatus;
  reviewMode: boolean;
  guidedMode: boolean;
  guidedTutorMode: GuidedTutorMode;
  hasDocument: boolean;
  hasReviewTarget: boolean;
  onStartTutor: () => void;
  onEndSession: () => void;
}) {
  if (status === "connecting") {
    return (
      <button
        className="primary-button tutor-session-action"
        type="button"
        disabled
      >
        {reviewMode
          ? "Starting review…"
          : guidedMode
            ? guidedTutorMode === "reading"
              ? "Starting guided reading…"
              : "Starting active learning…"
            : "Starting…"}
      </button>
    );
  }

  if (status === "connected") {
    return (
      <button
        className="secondary-button tutor-session-action"
        type="button"
        onClick={onEndSession}
      >
        <LogOut size={20} />
        End session
      </button>
    );
  }

  let startLabel = reviewMode
    ? "Start review"
    : guidedMode
      ? guidedTutorMode === "reading"
        ? "Start guided reading"
        : "Start active learning"
      : "Start tutor";

  if (status === "ended") {
    startLabel = reviewMode
      ? "Review again"
      : guidedMode
        ? guidedTutorMode === "reading"
          ? "Start guided reading again"
          : "Start active learning again"
        : "Start new session";
  }

  return (
    <button
      className="primary-button tutor-session-action"
      type="button"
      onClick={onStartTutor}
      disabled={!hasDocument || (reviewMode && !hasReviewTarget)}
    >
      <Play size={20} />
      {startLabel}
    </button>
  );
}

export function renderGuidedContinueAction(
  progress: GuidedSegmentProgress,
  busy: boolean,
  hasNextPage: boolean,
  onContinue: () => void,
): ReactNode {
  if (progress.pageComplete && !hasNextPage) {
    return (
      <strong className="guided-progress-complete">Lesson complete</strong>
    );
  }

  if (progress.learningPhase) {
    return null;
  }

  return (
    <button
      className="primary-button guided-continue-button"
      type="button"
      onClick={onContinue}
      disabled={busy}
    >
      {getGuidedContinueButtonLabel(progress, busy, hasNextPage)}
      {progress.pageComplete && hasNextPage ? (
        <ChevronRight size={17} aria-hidden="true" />
      ) : null}
    </button>
  );
}

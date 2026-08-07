import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";

import type {
  GuidedSegmentProgress,
  GuidedTutorMode,
} from "@/lib/use-realtime-tutor";

export function GuidedProgressCard({
  progress,
  connected,
  busy,
  hasNextPage,
  review,
  guidedTutorMode,
  onContinue,
}: {
  progress: GuidedSegmentProgress | null;
  connected: boolean;
  busy: boolean;
  hasNextPage: boolean;
  review: boolean;
  guidedTutorMode: GuidedTutorMode;
  onContinue: () => void;
}) {
  return (
    <section className="insight-card guided-progress-card">
      <h2>
        <span className="insight-card-icon">
          <Sparkles size={18} aria-hidden="true" />
        </span>
        {review
          ? "Review progress"
          : guidedTutorMode === "reading"
            ? "Reading progress"
            : "Learning progress"}
      </h2>
      {progress ? (
        <>
          {progress.sectionTitle ? (
            <p className="guided-section-title">
              {progress.sectionTitle}
            </p>
          ) : null}
          <strong className="guided-segment-title">
            {progress.conceptName ?? progress.title}
          </strong>
          {progress.learningPhase ? (
            <p className="learning-checkpoint-status">
              {getLearningCheckpointLabel(
                progress.learningPhase,
                progress.attemptNumber,
              )}
            </p>
          ) : null}
          {progress.sourceText ? (
            <p className="guided-passage-preview">{progress.sourceText}</p>
          ) : null}
          <p className="guided-segment-count">
            {review
              ? "Focused review of the saved source passage"
              : progress.segmentCount > 0
                ? `Lesson ${progress.segmentNumber} of ${progress.segmentCount} on this page`
                : "This page has no prepared lessons."}
          </p>
        </>
      ) : (
        <p className="guided-progress-placeholder">
          {review
            ? "Start the review when you are ready to answer by voice."
            : guidedTutorMode === "reading"
              ? "Start guided reading to hear the first page lesson."
              : "Start active learning with the first page lesson."}
        </p>
      )}
      {review && progress?.segmentComplete ? (
        <div className="review-complete-actions">
          <strong className="guided-progress-complete">
            Review complete
          </strong>
          <Link className="primary-button" href="/review">
            Back to review
          </Link>
        </div>
      ) : progress?.pageComplete && !hasNextPage ? (
        <strong className="guided-progress-complete">Lesson complete</strong>
      ) : connected && progress && !progress.learningPhase && !review ? (
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
      ) : null}
    </section>
  );
}

export function getGuidedContinueButtonLabel(
  progress: GuidedSegmentProgress,
  busy: boolean,
  hasNextPage: boolean,
) {
  if (progress.pageComplete) {
    return hasNextPage ? "Next page" : "Document complete";
  }

  if (busy) {
    return "Explaining…";
  }

  return progress.segmentComplete ? "Continue" : "Resume explanation";
}

function getLearningCheckpointLabel(
  phase: GuidedSegmentProgress["learningPhase"],
  attemptNumber: GuidedSegmentProgress["attemptNumber"],
) {
  if (phase === "diagnostic") {
    return "Quick diagnostic · no penalty";
  }

  if (phase === "review") {
    return attemptNumber === 2
      ? "Review retry · final attempt"
      : "Retrieval review";
  }

  return attemptNumber === 2
    ? "Checkpoint retry · final attempt"
    : "Retrieval checkpoint";
}

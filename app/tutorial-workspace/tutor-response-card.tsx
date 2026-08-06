import {
  LoaderCircle,
  MessageSquareText,
  Play,
  ScrollText,
} from "lucide-react";
import type { ReactNode } from "react";

export function TutorResponseCard({
  transcript,
  history,
  isStreaming,
  canReplayAudio,
  isReplayingAudio,
  sessionStatus,
  sessionActions,
  onReplayAudio,
  onOpen,
}: {
  transcript: string;
  history: string[];
  isStreaming: boolean;
  canReplayAudio: boolean;
  isReplayingAudio: boolean;
  sessionStatus: ReactNode;
  sessionActions: ReactNode;
  onReplayAudio: () => void;
  onOpen: () => void;
}) {
  const latestTranscript = transcript || history.at(-1) || "";
  const replayLabel = isReplayingAudio
    ? "Replaying tutor response"
    : "Replay tutor response";

  return (
    <section className="insight-card tutor-response-card">
      <header className="tutor-response-header">
        <h2>
          <span className="insight-card-icon">
            <MessageSquareText size={18} aria-hidden="true" />
          </span>
          Tutor response
        </h2>
        <div className="tutor-response-tools">
          <button
            className="icon-button small"
            type="button"
            onClick={onReplayAudio}
            disabled={!canReplayAudio || isStreaming || isReplayingAudio}
            aria-label={replayLabel}
            title={replayLabel}
          >
            {isReplayingAudio ? (
              <LoaderCircle
                className="tutor-response-tool-spinner"
                size={16}
                aria-hidden="true"
              />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button small"
            type="button"
            onClick={onOpen}
            disabled={history.length === 0}
            aria-label="View full transcript"
            title="View full transcript"
          >
            <ScrollText size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {sessionStatus ? (
        <div className="tutor-response-status">{sessionStatus}</div>
      ) : null}
      <p className={latestTranscript ? undefined : "selection-placeholder"}>
        {latestTranscript ||
          (isStreaming
            ? "The tutor is preparing a response…"
            : "The tutor’s response will appear here.")}
      </p>
      {sessionActions ? (
        <div className="tutor-response-session-actions">
          {sessionActions}
        </div>
      ) : null}
    </section>
  );
}

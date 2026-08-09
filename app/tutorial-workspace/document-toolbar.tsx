import {
  Download,
  Ellipsis,
  FileText,
  LogOut,
  Trash2,
} from "lucide-react";

import { NewTutorialButton } from "@/app/new-tutorial-button";
import type { TutorialResponse } from "@/lib/tutorial";

export function DocumentToolbar({
  tutorial,
  modeLabel,
  reviewMode,
  guidedSessionActive,
  onDownload,
  onTutorialQueued,
  onEndSession,
  onDelete,
}: {
  tutorial: TutorialResponse | null;
  modeLabel: string;
  reviewMode: boolean;
  guidedSessionActive: boolean;
  onDownload: () => void;
  onTutorialQueued: (tutorial: TutorialResponse) => void;
  onEndSession: () => void;
  onDelete: () => void;
}) {
  return (
    <header className="lesson-toolbar">
      <div>
        <FileText size={20} aria-hidden="true" />
        <h2>{tutorial?.title ?? "Document reader"}</h2>
      </div>
      <div className="lesson-toolbar-controls">
        {guidedSessionActive ? (
          <div
            className="active-tutor-session"
            role="group"
            aria-label={`${modeLabel} session active`}
          >
            <span className="active-tutor-session-status">
              <span
                className="active-tutor-session-dot"
                aria-hidden="true"
              />
              <strong>{modeLabel}</strong>
              <small>Live</small>
            </span>
            <button
              className="secondary-button active-tutor-session-end"
              type="button"
              onClick={onEndSession}
              aria-label={`End ${modeLabel.toLowerCase()} session`}
              title="End session"
            >
              <LogOut size={16} aria-hidden="true" />
              <span>End session</span>
            </button>
          </div>
        ) : reviewMode ? (
          <div
            className="tutor-mode-selector"
            role="group"
            aria-label="Tutor mode"
          >
            <button
              className="active"
              type="button"
              disabled
              aria-pressed="true"
            >
              Review
            </button>
          </div>
        ) : null}
        <div className="lesson-actions">
          <button
            className="icon-button small"
            type="button"
            onClick={onDownload}
            disabled={!tutorial}
            aria-label="Download PDF"
          >
            <Download size={18} />
          </button>
          <NewTutorialButton
            variant="icon"
            onQueued={onTutorialQueued}
          />
          <details className="document-actions-menu">
            <summary
              className="icon-button small"
              aria-label="More document actions"
            >
              <Ellipsis size={19} />
            </summary>
            <div className="document-actions-popover">
              <button
                type="button"
                onClick={onDelete}
                disabled={!tutorial}
              >
                <Trash2 size={17} />
                Delete document
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

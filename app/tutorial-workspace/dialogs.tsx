import { MessageSquareText, X } from "lucide-react";
import type { ReactNode } from "react";

export function TranscriptDialog({
  transcripts,
  onClose,
}: {
  transcripts: string[];
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal transcript-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transcript-title"
      >
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close transcript"
        >
          <X size={22} />
        </button>
        <div className="modal-icon">
          <MessageSquareText size={23} />
        </div>
        <p className="modal-eyebrow">Tutor conversation</p>
        <h2 id="transcript-title">Transcript</h2>
        <div className="transcript-content">
          {transcripts.length ? (
            transcripts.map((transcript, index) => (
              <article key={`${index}:${transcript.slice(0, 24)}`}>
                <small>Tutor response {index + 1}</small>
                <p>{transcript}</p>
              </article>
            ))
          ) : (
            <p className="transcript-empty">No tutor response yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function ConfirmationDialog({
  eyebrow,
  title,
  message,
  confirmLabel,
  icon,
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  eyebrow: string;
  title: string;
  message: string;
  confirmLabel: string;
  icon: ReactNode;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
      >
        <button
          className="modal-close"
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close dialog"
        >
          <X size={22} />
        </button>
        <div className={`modal-icon${destructive ? " danger" : ""}`}>
          {icon}
        </div>
        <p className="modal-eyebrow">{eyebrow}</p>
        <h2 id="confirmation-title">{title}</h2>
        <p className="modal-copy">{message}</p>
        <div className="modal-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className={`primary-button${
              destructive ? " danger-button" : ""
            }`}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {icon}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

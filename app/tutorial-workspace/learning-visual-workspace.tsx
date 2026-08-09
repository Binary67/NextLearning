import { Sparkles } from "lucide-react";

import type { LearningVisualState } from "@/lib/use-realtime-tutor";

import { LearningVisualFrame } from "./learning-visual-frame";

export function LearningVisualWorkspace({
  state,
  hasSelection,
  creationEnabled,
  sessionStarting,
  sessionStartEnabled,
  onCreate,
  onStartTutor,
}: {
  state: LearningVisualState;
  hasSelection: boolean;
  creationEnabled: boolean;
  sessionStarting: boolean;
  sessionStartEnabled: boolean;
  onCreate: () => void;
  onStartTutor: () => void;
}) {
  if (state.status === "generating") {
    return (
      <div className="visual-workspace-state" role="status">
        <span className="visual-loading-indicator" aria-hidden="true" />
        <p>Learning visual</p>
        <h3>Building your visual…</h3>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="visual-workspace-state visual-workspace-error"
        role="alert"
      >
        <p>Learning visual unavailable</p>
        <h3>The visual could not be shown</h3>
        <span>{state.message}</span>
        <CreateVisualButton
          label="Try again"
          enabled={creationEnabled}
          onCreate={onCreate}
        />
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <LearningVisualFrame
        title={state.visual.title}
        altText={state.visual.altText}
        htmlFragment={state.visual.htmlFragment}
      />
    );
  }

  let actionLabel = "Start tutor session";
  let actionEnabled = sessionStartEnabled;
  let onAction = onStartTutor;

  if (creationEnabled) {
    actionLabel = hasSelection
      ? "Create visual from selection"
      : "Create visual";
    actionEnabled = true;
    onAction = onCreate;
  } else if (sessionStarting) {
    actionLabel = "Starting tutor…";
  }

  return (
    <div className="visual-workspace-state visual-workspace-empty">
      <span className="visual-empty-icon" aria-hidden="true">
        <Sparkles size={22} />
      </span>
      <h3>Visualize this page</h3>
      <span>
        Create an interactive explanation from the current page or
        selected text.
      </span>
      <CreateVisualButton
        label={actionLabel}
        enabled={actionEnabled}
        onCreate={onAction}
      />
    </div>
  );
}

function CreateVisualButton({
  label,
  enabled,
  onCreate,
}: {
  label: string;
  enabled: boolean;
  onCreate: () => void;
}) {
  return (
    <button
      className="primary-button visual-create-button"
      type="button"
      onClick={onCreate}
      disabled={!enabled}
    >
      {label}
    </button>
  );
}

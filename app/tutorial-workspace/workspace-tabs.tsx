import type { KeyboardEvent } from "react";

import type { WorkspaceView } from "./types";

export function WorkspaceTabs({
  activeWorkspaceView,
  documentPanelId,
  documentTabId,
  visualPanelId,
  visualTabId,
  onWorkspaceViewChange,
}: {
  activeWorkspaceView: WorkspaceView;
  documentPanelId: string;
  documentTabId: string;
  visualPanelId: string;
  visualTabId: string;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
}) {
  return (
    <div
      className="workspace-tabs"
      role="tablist"
      aria-label="Lesson workspace views"
      onKeyDown={handleTabKeyDown}
    >
      <button
        id={documentTabId}
        className="workspace-tab"
        type="button"
        role="tab"
        aria-selected={activeWorkspaceView === "document"}
        aria-controls={documentPanelId}
        tabIndex={activeWorkspaceView === "document" ? 0 : -1}
        onClick={() => onWorkspaceViewChange("document")}
      >
        Document
      </button>
      <button
        id={visualTabId}
        className="workspace-tab"
        type="button"
        role="tab"
        aria-selected={activeWorkspaceView === "visual"}
        aria-controls={visualPanelId}
        tabIndex={activeWorkspaceView === "visual" ? 0 : -1}
        onClick={() => onWorkspaceViewChange("visual")}
      >
        Visual
      </button>
    </div>
  );
}

function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    ),
  );
  const currentIndex = tabs.indexOf(
    event.target as HTMLButtonElement,
  );
  let nextIndex: number;

  switch (event.key) {
    case "ArrowLeft":
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      break;
    case "ArrowRight":
      nextIndex = (currentIndex + 1) % tabs.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = tabs.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  tabs[nextIndex]?.click();
  tabs[nextIndex]?.focus();
}

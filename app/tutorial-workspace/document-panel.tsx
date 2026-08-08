import {
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  FileText,
  LogOut,
  ScanText,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import { useId } from "react";

import { NewTutorialButton } from "@/app/new-tutorial-button";
import { PdfDocumentViewer } from "@/app/pdf-document-viewer";
import type { DocumentModel } from "@/lib/document-model";
import type {
  DocumentSelection,
  SelectionBounds,
} from "@/lib/document-selection";
import type { TutorialResponse } from "@/lib/tutorial";
import type { LearningVisualState } from "@/lib/use-realtime-tutor";

import { LearningVisualFrame } from "./learning-visual-frame";

export type WorkspaceView = "document" | "visual";

export function DocumentPanel({
  tutorial,
  documentModel,
  documentError,
  currentPage,
  pageCount,
  selection,
  tutorHighlightBounds,
  pdfInstruction,
  modeLabel,
  reviewMode,
  guidedSessionActive,
  pageNavigationDisabled,
  tutorPageIndex,
  learningVisualState,
  activeWorkspaceView,
  onChangePage,
  onReturnToTutor,
  onSelectionChange,
  onDownload,
  onTutorialQueued,
  onEndSession,
  onDelete,
  onWorkspaceViewChange,
}: {
  tutorial: TutorialResponse | null;
  documentModel: DocumentModel | null;
  documentError: string;
  currentPage: number;
  pageCount: number;
  selection: DocumentSelection | null;
  tutorHighlightBounds: SelectionBounds[];
  pdfInstruction: string;
  modeLabel: string;
  reviewMode: boolean;
  guidedSessionActive: boolean;
  pageNavigationDisabled: boolean;
  tutorPageIndex: number | null;
  learningVisualState: LearningVisualState;
  activeWorkspaceView: WorkspaceView;
  onChangePage: (pageIndex: number) => void;
  onReturnToTutor: () => void;
  onSelectionChange: (selection: DocumentSelection | null) => void;
  onDownload: () => void;
  onTutorialQueued: (tutorial: TutorialResponse) => void;
  onEndSession: () => void;
  onDelete: () => void;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
}) {
  const tabIdPrefix = useId();
  const documentTabId = `${tabIdPrefix}-document-tab`;
  const documentPanelId = `${tabIdPrefix}-document-panel`;
  const visualTabId = `${tabIdPrefix}-visual-tab`;
  const visualPanelId = `${tabIdPrefix}-visual-panel`;
  const showVisualWorkspace = learningVisualState.status !== "idle";

  return (
    <section className="lesson-card">
      <div className="lesson-header">
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

        {showVisualWorkspace && (
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
        )}
      </div>

      <div className="lesson-panel-stack">
        <div
          id={documentPanelId}
          className="workspace-panel"
          role={showVisualWorkspace ? "tabpanel" : undefined}
          aria-labelledby={showVisualWorkspace ? documentTabId : undefined}
          hidden={
            showVisualWorkspace && activeWorkspaceView !== "document"
          }
        >
          {documentError ? (
            <DocumentState
              icon={<FileText size={34} />}
              eyebrow="Document unavailable"
              title="The PDF could not be opened"
              message={documentError}
              error
            />
          ) : tutorial && documentModel ? (
            <div className="workspace-content">
              <div className="pdf-content">
                <div className="pdf-page-bar">
                  <div className="pdf-page-controls">
                    <button
                      className="icon-button small"
                      type="button"
                      onClick={() => onChangePage(currentPage - 1)}
                      disabled={
                        currentPage <= 1 ||
                        reviewMode ||
                        pageNavigationDisabled
                      }
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <span>
                      <strong>{currentPage}</strong>
                      <i>/</i>
                      {pageCount}
                    </span>
                    <button
                      className="icon-button small"
                      type="button"
                      onClick={() => onChangePage(currentPage + 1)}
                      disabled={
                        currentPage >= pageCount ||
                        reviewMode ||
                        pageNavigationDisabled
                      }
                      aria-label="Next page"
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                  <div className="pdf-selection-context">
                    <ScanText size={15} aria-hidden="true" />
                    <strong>{pdfInstruction}</strong>
                    {tutorPageIndex !== null &&
                      currentPage !== tutorPageIndex && (
                        <button
                          className="pdf-return-to-tutor-button"
                          type="button"
                          onClick={onReturnToTutor}
                        >
                          Return to tutor · page {tutorPageIndex}
                        </button>
                      )}
                    {selection && (
                      <button
                        className="icon-button pdf-clear-selection-button"
                        type="button"
                        onClick={() => onSelectionChange(null)}
                        aria-label="Clear selection"
                        title="Clear selection"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="pdf-stage">
                  <PdfDocumentViewer
                    documentId={tutorial.id}
                    documentUrl={tutorial.url}
                    documentName={tutorial.documentName}
                    pageIndex={currentPage}
                    selection={selection}
                    tutorHighlightBounds={tutorHighlightBounds}
                    onSelectionChange={onSelectionChange}
                  />
                </div>
              </div>
            </div>
          ) : (
            <DocumentState
              icon={<FileText size={34} />}
              eyebrow="No document"
              title="Choose a PDF to begin"
              message="Upload a PDF to begin guided reading or active learning."
            />
          )}
        </div>

        {showVisualWorkspace && (
          <div
            id={visualPanelId}
            className="workspace-panel"
            role="tabpanel"
            aria-labelledby={visualTabId}
            hidden={activeWorkspaceView !== "visual"}
          >
            <div className="visual-workspace">
              <VisualWorkspaceContent state={learningVisualState} />
            </div>
          </div>
        )}
      </div>
    </section>
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

function VisualWorkspaceContent({
  state,
}: {
  state: LearningVisualState;
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

  return null;
}

function DocumentState({
  icon,
  eyebrow,
  title,
  message,
  error = false,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  message: string;
  error?: boolean;
}) {
  return (
    <div className="document-state">
      <span className="document-state-icon">{icon}</span>
      <p className="document-state-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className={error ? "document-error" : undefined}>{message}</p>
      <Link className="secondary-button upload-button" href="/library">
        Back to library
      </Link>
    </div>
  );
}

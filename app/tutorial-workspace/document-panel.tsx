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
import type { ReactNode } from "react";

import { NewTutorialButton } from "@/app/new-tutorial-button";
import { PdfDocumentViewer } from "@/app/pdf-document-viewer";
import type { DocumentModel } from "@/lib/document-model";
import type {
  DocumentSelection,
  SelectionBounds,
} from "@/lib/document-selection";
import type { TutorialResponse } from "@/lib/tutorial";

import type { TutorMode } from "./types";

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
  tutorMode,
  sessionActive,
  guidedSessionActive,
  pageNavigationDisabled,
  onChangePage,
  onSelectionChange,
  onTutorModeChange,
  onDownload,
  onTutorialQueued,
  onEndSession,
  onDelete,
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
  tutorMode: TutorMode;
  sessionActive: boolean;
  guidedSessionActive: boolean;
  pageNavigationDisabled: boolean;
  onChangePage: (pageIndex: number) => void;
  onSelectionChange: (selection: DocumentSelection | null) => void;
  onTutorModeChange: (mode: TutorMode) => void;
  onDownload: () => void;
  onTutorialQueued: (tutorial: TutorialResponse) => void;
  onEndSession: () => void;
  onDelete: () => void;
}) {
  const guidedMode = tutorMode === "guided";
  const reviewMode = tutorMode === "review";

  return (
    <section className="lesson-card">
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
          ) : (
            <div
              className="tutor-mode-selector"
              role="group"
              aria-label="Tutor mode"
            >
              {reviewMode ? (
                <button
                  className="active"
                  type="button"
                  disabled
                  aria-pressed="true"
                >
                  Review
                </button>
              ) : (
                <>
                  <button
                    className={guidedMode ? undefined : "active"}
                    type="button"
                    onClick={() => onTutorModeChange("read")}
                    disabled={sessionActive}
                    aria-pressed={!guidedMode}
                  >
                    Read
                  </button>
                  <button
                    className={guidedMode ? "active" : undefined}
                    type="button"
                    onClick={() => onTutorModeChange("guided")}
                    disabled={sessionActive}
                    aria-pressed={guidedMode}
                  >
                    Tutor
                  </button>
                </>
              )}
            </div>
          )}
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
          message="Upload a PDF, select a region, and ask questions by voice."
        />
      )}
    </section>
  );
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

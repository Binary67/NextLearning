import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ScanText,
  X,
} from "lucide-react";
import { useId } from "react";

import { PdfDocumentViewer } from "@/app/pdf-document-viewer";
import type { ProgressiveTutorialResponse } from "@/app/tutorial-progressive";
import type { DocumentModel } from "@/lib/document-model";
import type {
  DocumentSelection,
  SelectionBounds,
} from "@/lib/document-selection";
import type { LearningVisualState } from "@/lib/use-realtime-tutor";

import { DocumentState } from "./document-states";
import { DocumentToolbar } from "./document-toolbar";
import {
  formatHighlightedSourcePages,
  getAdjacentHighlightedPage,
} from "./highlighted-pages";
import { LearningVisualWorkspace } from "./learning-visual-workspace";
import type { WorkspaceView } from "./types";
import { WorkspaceTabs } from "./workspace-tabs";

export function DocumentPanel({
  tutorial,
  documentModel,
  documentError,
  currentPage,
  pageCount,
  selection,
  tutorHighlightBounds,
  highlightedSourcePages,
  pdfInstruction,
  modeLabel,
  reviewMode,
  guidedSessionActive,
  pageNavigationDisabled,
  availabilityNotice,
  learningVisualState,
  visualCreationEnabled,
  visualSessionStarting,
  visualSessionStartEnabled,
  activeWorkspaceView,
  onChangePage,
  onChangeHighlightedPage,
  onReturnToHighlight,
  onCreateVisual,
  onStartTutor,
  onSelectionChange,
  onDownload,
  onTutorialQueued,
  onEndSession,
  onDelete,
  onWorkspaceViewChange,
}: {
  tutorial: ProgressiveTutorialResponse | null;
  documentModel: DocumentModel | null;
  documentError: string;
  currentPage: number;
  pageCount: number;
  selection: DocumentSelection | null;
  tutorHighlightBounds: SelectionBounds[];
  highlightedSourcePages: number[];
  pdfInstruction: string;
  modeLabel: string;
  reviewMode: boolean;
  guidedSessionActive: boolean;
  pageNavigationDisabled: boolean;
  availabilityNotice: string | null;
  learningVisualState: LearningVisualState;
  visualCreationEnabled: boolean;
  visualSessionStarting: boolean;
  visualSessionStartEnabled: boolean;
  activeWorkspaceView: WorkspaceView;
  onChangePage: (pageIndex: number) => void;
  onChangeHighlightedPage: (pageIndex: number) => void;
  onReturnToHighlight: () => void;
  onCreateVisual: () => void;
  onStartTutor: () => void;
  onSelectionChange: (selection: DocumentSelection | null) => void;
  onDownload: () => void;
  onTutorialQueued: (tutorial: ProgressiveTutorialResponse) => void;
  onEndSession: () => void;
  onDelete: () => void;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
}) {
  const tabIdPrefix = useId();
  const documentTabId = `${tabIdPrefix}-document-tab`;
  const documentPanelId = `${tabIdPrefix}-document-panel`;
  const visualTabId = `${tabIdPrefix}-visual-tab`;
  const visualPanelId = `${tabIdPrefix}-visual-panel`;
  const showWorkspaceTabs = Boolean(tutorial && documentModel);
  const earliestHighlightedPage = highlightedSourcePages[0] ?? null;
  const previousHighlightedPage = getAdjacentHighlightedPage(
    highlightedSourcePages,
    currentPage,
    "previous",
  );
  const nextHighlightedPage = getAdjacentHighlightedPage(
    highlightedSourcePages,
    currentPage,
    "next",
  );
  const highlightedSourceLabel = formatHighlightedSourcePages(
    highlightedSourcePages,
  );

  function goToHighlightedPage(pageIndex: number | null) {
    if (pageIndex !== null) {
      onChangeHighlightedPage(pageIndex);
    }
  }

  return (
    <section className="lesson-card">
      <div className="lesson-header">
        <DocumentToolbar
          tutorial={tutorial}
          modeLabel={modeLabel}
          reviewMode={reviewMode}
          guidedSessionActive={guidedSessionActive}
          onDownload={onDownload}
          onTutorialQueued={onTutorialQueued}
          onEndSession={onEndSession}
          onDelete={onDelete}
        />

        {showWorkspaceTabs && (
          <WorkspaceTabs
            activeWorkspaceView={activeWorkspaceView}
            documentPanelId={documentPanelId}
            documentTabId={documentTabId}
            visualPanelId={visualPanelId}
            visualTabId={visualTabId}
            onWorkspaceViewChange={onWorkspaceViewChange}
          />
        )}
        {availabilityNotice ? (
          <p
            className="tutorial-availability-notice"
            role="status"
            aria-live="polite"
          >
            {availabilityNotice}
          </p>
        ) : null}
      </div>

      <div className="lesson-panel-stack">
        <div
          id={documentPanelId}
          className="workspace-panel"
          role={showWorkspaceTabs ? "tabpanel" : undefined}
          aria-labelledby={showWorkspaceTabs ? documentTabId : undefined}
          hidden={
            showWorkspaceTabs && activeWorkspaceView !== "document"
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
                    {highlightedSourcePages.length > 0 && (
                      <span className="pdf-highlighted-source-label">
                        {highlightedSourceLabel}
                      </span>
                    )}
                    {highlightedSourcePages.length > 1 && (
                      <div
                        className="pdf-highlighted-page-controls"
                        role="group"
                        aria-label="Highlighted source pages"
                      >
                        <button
                          className="icon-button small"
                          type="button"
                          onClick={() =>
                            goToHighlightedPage(previousHighlightedPage)
                          }
                          disabled={
                            previousHighlightedPage === null ||
                            pageNavigationDisabled
                          }
                          aria-label="Previous highlighted page"
                        >
                          <ChevronLeft size={15} />
                        </button>
                        <button
                          className="icon-button small"
                          type="button"
                          onClick={() =>
                            goToHighlightedPage(nextHighlightedPage)
                          }
                          disabled={
                            nextHighlightedPage === null ||
                            pageNavigationDisabled
                          }
                          aria-label="Next highlighted page"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    )}
                    {earliestHighlightedPage !== null &&
                      currentPage !== earliestHighlightedPage && (
                        <button
                          className="pdf-return-to-highlight-button"
                          type="button"
                          onClick={onReturnToHighlight}
                        >
                          Return to first highlighted page · page{" "}
                          {earliestHighlightedPage}
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

        {showWorkspaceTabs && (
          <div
            id={visualPanelId}
            className="workspace-panel"
            role="tabpanel"
            aria-labelledby={visualTabId}
            hidden={activeWorkspaceView !== "visual"}
          >
            <div className="visual-workspace">
              <LearningVisualWorkspace
                state={learningVisualState}
                hasSelection={selection !== null}
                creationEnabled={visualCreationEnabled}
                sessionStarting={visualSessionStarting}
                sessionStartEnabled={visualSessionStartEnabled}
                onCreate={onCreateVisual}
                onStartTutor={onStartTutor}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

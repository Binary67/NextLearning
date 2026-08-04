"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Hand,
  LogOut,
  MessageSquareText,
  Play,
  ScanText,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

import { AppHeader } from "@/app/app-header";
import {
  LearningSettingsDialog,
  useLearningSettings,
} from "@/app/learning-settings";
import { NewTutorialButton } from "@/app/new-tutorial-button";
import {
  PdfDocumentViewer,
} from "@/app/pdf-document-viewer";
import type {
  DocumentModel,
  TextSelectionContext,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";
import type { TutorialResponse } from "@/lib/tutorial";
import {
  type GuidedSegmentProgress,
  useRealtimeTutor,
} from "@/lib/use-realtime-tutor";

type Modal =
  | "transcript"
  | "settings"
  | "end-session"
  | "delete-tutorial"
  | null;

type TutorialDataResponse = {
  tutorial?: TutorialResponse;
  model?: DocumentModel;
  message?: string;
};

type RelatedPagesStatus = "idle" | "loading" | "ready" | "error";

type TutorMode = "read" | "guided";

type RelatedPagesResult = {
  selectionKey: string;
  status: "ready" | "error";
  context: TextSelectionContext | null;
};

type RelatedPagesResponse = {
  text_selection?: TextSelectionContext | null;
  message?: string;
};

export function TutorialWorkspace({
  tutorialId,
}: {
  tutorialId: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [activeTutorial, setActiveTutorial] =
    useState<TutorialResponse | null>(null);
  const [documentModel, setDocumentModel] =
    useState<DocumentModel | null>(null);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState("");
  const [deletingTutorial, setDeletingTutorial] = useState(false);
  const [tutorMode, setTutorMode] = useState<TutorMode>("read");
  const [currentPage, setCurrentPage] = useState(1);
  const [selection, setSelection] = useState<DocumentSelection | null>(
    null,
  );
  const {
    raiseHandShortcut,
    raiseHandShortcutLabel,
    audioInputDeviceId,
    audioOutputDeviceId,
  } = useLearningSettings();
  const { textSelectionContext, relatedPagesStatus } = useRelatedPages(
    tutorialId,
    documentModel,
    selection,
  );
  const relatedPagesLoading = relatedPagesStatus === "loading";
  const guidedMode = tutorMode === "guided";
  const learnerCanAsk =
    guidedMode || Boolean(selection && !relatedPagesLoading);
  let learnerTurnPrompt = guidedMode
    ? `Press ${raiseHandShortcutLabel} to ask about this part`
    : "Draw a rectangle on the PDF";

  if (selection) {
    learnerTurnPrompt = !guidedMode && relatedPagesLoading
      ? "Finding related pages…"
      : `Press ${raiseHandShortcutLabel} to ask about the selection`;
  }

  const realtimeTutor = useRealtimeTutor({
    documentId: activeTutorial?.id ?? null,
    documentModel,
    selection,
    textSelectionContext,
    relatedPagesLoading,
    audioInputDeviceId,
    audioOutputDeviceId,
  });
  const sessionActive =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.status === "connected";
  const modeLabel = guidedMode ? "Guided tutor" : "Read and ask";
  const audioSettingsDisabled =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn;
  const pageCount = documentModel?.page_count ?? 0;
  const guidedProgress =
    realtimeTutor.guidedSegmentProgress?.pageIndex === currentPage
      ? realtimeTutor.guidedSegmentProgress
      : null;
  const guidedTurnBusy =
    realtimeTutor.isTutorResponding ||
    realtimeTutor.isTutorSpeaking ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn;

  useEffect(() => {
    const controller = new AbortController();

    async function loadTutorialData() {
      setDocumentLoading(true);
      setDocumentError("");
      setActiveTutorial(null);
      setDocumentModel(null);
      setSelection(null);

      try {
        const data = await readTutorialData(tutorialId, controller.signal);
        setActiveTutorial(data.tutorial);
        setDocumentModel(data.model);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setDocumentError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setDocumentLoading(false);
        }
      }
    }

    void loadTutorialData();
    return () => controller.abort();
  }, [tutorialId]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const toggleUserTurn = useCallback(async () => {
    const wasListening = realtimeTutor.isUserTurn;
    const actionSucceeded = await realtimeTutor.toggleUserTurn();

    if (!actionSucceeded) {
      return;
    }

    showToast(
      wasListening
        ? "Question sent. Waiting for the tutor."
        : `Listening. Press ${raiseHandShortcutLabel} or tap the check when you finish.`,
    );
  }, [raiseHandShortcutLabel, realtimeTutor, showToast]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isInteractiveTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(
            target.tagName,
          ));

      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isInteractiveTarget
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "escape") {
        setModal(null);
      } else if (
        key === "t" &&
        realtimeTutor.tutorTranscripts.length > 0
      ) {
        setModal("transcript");
      } else if (key === "e" && sessionActive) {
        setModal("end-session");
      } else if (
        key === raiseHandShortcut &&
        realtimeTutor.status === "connected" &&
        modal === null &&
        learnerCanAsk
      ) {
        event.preventDefault();
        void toggleUserTurn();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    modal,
    learnerCanAsk,
    raiseHandShortcut,
    realtimeTutor.status,
    realtimeTutor.tutorTranscripts.length,
    sessionActive,
    toggleUserTurn,
  ]);

  function changePage(pageIndex: number) {
    if (
      pageIndex < 1 ||
      pageIndex > pageCount ||
      (guidedMode && realtimeTutor.status === "connecting")
    ) {
      return;
    }

    setCurrentPage(pageIndex);
    setSelection(null);

    if (guidedMode && realtimeTutor.status === "connected") {
      void realtimeTutor.explainPage(pageIndex);
    }
  }

  function downloadDocument() {
    if (!activeTutorial) {
      return;
    }

    const link = document.createElement("a");
    link.href = `${activeTutorial.url}?download=1`;
    link.click();
    showToast("Document download started.");
  }

  async function deleteTutorial() {
    setDeletingTutorial(true);

    try {
      const response = await fetch(`/api/tutorials/${tutorialId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("The document could not be deleted.");
      }

      realtimeTutor.reset();
      router.replace("/library");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "The document could not be deleted.",
      );
    } finally {
      setDeletingTutorial(false);
    }
  }

  function startTutor() {
    if (guidedMode) {
      void realtimeTutor.startGuided(currentPage);
      return;
    }

    void realtimeTutor.start();
  }

  function continueGuided() {
    if (!guidedProgress) {
      return;
    }

    if (guidedProgress.pageComplete) {
      if (currentPage < pageCount) {
        changePage(currentPage + 1);
      }

      return;
    }

    void realtimeTutor.continueGuided();
  }

  function endSession() {
    realtimeTutor.end();
    setModal(null);
    showToast("Session ended.");
  }

  function renderTutorStatus() {
    if (realtimeTutor.status === "connecting") {
      return (
        <span className="turn-state-copy">
          <small>{modeLabel}</small>
          <strong>
            {guidedMode
              ? "Connecting and preparing this page…"
              : "Connecting…"}
          </strong>
        </span>
      );
    }

    if (realtimeTutor.status === "connected") {
      if (realtimeTutor.isSubmittingUserTurn) {
        return (
          <span className="turn-state-copy">
            <small>{modeLabel} · Your turn</small>
            <strong>Sending your question…</strong>
          </span>
        );
      }

      if (realtimeTutor.isUserTurn) {
        return (
          <span className="turn-state-copy">
            <small className="listening-label">
              <span className="listening-dot" aria-hidden="true" />
              {modeLabel} · Listening
            </small>
            <strong>
              {selection
                ? "Ask about the selected region"
                : "Ask about this page"}
            </strong>
          </span>
        );
      }

      if (
        realtimeTutor.isTutorResponding ||
        realtimeTutor.isTutorSpeaking
      ) {
        return (
          <span className="turn-state-copy">
            <small>{modeLabel} · Tutor</small>
            <strong>
              {realtimeTutor.isTutorSpeaking
                ? "Speaking…"
                : guidedMode
                  ? "Explaining…"
                  : "Thinking…"}
            </strong>
          </span>
        );
      }

      return (
        <span className="turn-state-copy">
          <small>{modeLabel} · Your turn</small>
          <strong>{learnerTurnPrompt}</strong>
        </span>
      );
    }

    if (realtimeTutor.status === "error") {
      return (
        <span className="turn-state-copy error">
          <small>{modeLabel} · Tutor unavailable</small>
          <strong>{realtimeTutor.error}</strong>
        </span>
      );
    }

    if (realtimeTutor.status === "ended") {
      return (
        <span className="turn-state-copy">
          <small>{modeLabel}</small>
          <strong>Session ended</strong>
        </span>
      );
    }

    return (
      <span className="turn-state-copy">
        <small>{modeLabel}</small>
        <strong>
          {guidedMode
            ? "Ready to guide this page"
            : selection
              ? "Ready to start"
              : "Select something to discuss"}
        </strong>
      </span>
    );
  }

  function renderSessionAction() {
    if (sessionActive) {
      return (
        <button
          className="primary-button end-button"
          type="button"
          onClick={() => setModal("end-session")}
        >
          <LogOut size={20} />
          End Session
        </button>
      );
    }

    return (
      <button
        className="primary-button end-button"
        type="button"
        onClick={startTutor}
        disabled={!documentModel}
      >
        <Play size={20} />
        {realtimeTutor.status === "ended"
          ? guidedMode
            ? "New Guided Session"
            : "New Session"
          : guidedMode
            ? "Start Guided Tutor"
            : "Start Tutor"}
      </button>
    );
  }

  return (
    <main className="app-shell">
      <AppHeader
        activeSection="dashboard"
        dashboardHref={`/tutorials/${tutorialId}`}
        settingsOpen={modal === "settings"}
        onOpenSettings={() => setModal("settings")}
        onShowMessage={showToast}
      />

      <div className="dashboard-layout">
        <section className="lesson-card">
          <header className="lesson-toolbar">
            <div>
              <FileText size={20} aria-hidden="true" />
              <h2>{activeTutorial?.title ?? "Document reader"}</h2>
            </div>
            <div className="lesson-toolbar-controls">
              <div
                className="tutor-mode-selector"
                role="group"
                aria-label="Tutor mode"
              >
                <button
                  className={guidedMode ? undefined : "active"}
                  type="button"
                  onClick={() => setTutorMode("read")}
                  disabled={sessionActive}
                  aria-pressed={!guidedMode}
                >
                  Read and ask
                </button>
                <button
                  className={guidedMode ? "active" : undefined}
                  type="button"
                  onClick={() => setTutorMode("guided")}
                  disabled={sessionActive}
                  aria-pressed={guidedMode}
                >
                  Guided tutor
                </button>
              </div>
              <div className="lesson-actions">
                <button
                  className="icon-button small"
                  type="button"
                  onClick={downloadDocument}
                  disabled={!activeTutorial}
                  aria-label="Download PDF"
                >
                  <Download size={18} />
                </button>
                <button
                  className="icon-button small danger-icon-button"
                  type="button"
                  onClick={() => setModal("delete-tutorial")}
                  disabled={!activeTutorial}
                  aria-label="Delete document"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <NewTutorialButton
                variant="icon"
                onQueued={() =>
                  showToast("Document added to the preparation queue.")
                }
              />
            </div>
          </header>

          {documentLoading ? (
            <DocumentState
              icon={<Sparkles size={34} />}
              eyebrow="Preparing reader"
              title="Loading the document"
              message="Getting its concepts and page context ready."
            />
          ) : documentError ? (
            <DocumentState
              icon={<FileText size={34} />}
              eyebrow="Document unavailable"
              title="The PDF could not be opened"
              message={documentError}
              error
            />
          ) : activeTutorial && documentModel ? (
            <div className="pdf-content">
              <div className="pdf-page-bar">
                <div className="pdf-page-controls">
                  <button
                    className="icon-button small"
                    type="button"
                    onClick={() => changePage(currentPage - 1)}
                    disabled={
                      currentPage <= 1 ||
                      (guidedMode &&
                        realtimeTutor.status === "connecting")
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
                    onClick={() => changePage(currentPage + 1)}
                    disabled={
                      currentPage >= pageCount ||
                      (guidedMode &&
                        realtimeTutor.status === "connecting")
                    }
                    aria-label="Next page"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <div className="pdf-selection-context">
                  <ScanText size={15} aria-hidden="true" />
                  <strong>
                    {selection
                      ? "Selection ready—ask your question"
                      : guidedMode
                        ? "Follow along, or select a region for a narrower question"
                        : "Draw a rectangle around anything you want explained"}
                  </strong>
                  {selection && (
                    <button
                      className="icon-button pdf-clear-selection-button"
                      type="button"
                      onClick={() => setSelection(null)}
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
                  documentId={activeTutorial.id}
                  documentUrl={activeTutorial.url}
                  documentName={activeTutorial.documentName}
                  pageIndex={currentPage}
                  selection={selection}
                  onSelectionChange={setSelection}
                />
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

        <aside className="insights-column" aria-label="Reading context">
          {guidedMode ? (
            <GuidedProgressCard
              progress={guidedProgress}
              connected={realtimeTutor.status === "connected"}
              busy={guidedTurnBusy}
              hasNextPage={currentPage < pageCount}
              onContinue={continueGuided}
            />
          ) : null}

          <TutorTranscriptCard
            transcript={realtimeTutor.currentTutorTranscript}
            history={realtimeTutor.tutorTranscripts}
            isStreaming={
              realtimeTutor.isTutorResponding ||
              realtimeTutor.isTutorSpeaking
            }
            onOpen={() => setModal("transcript")}
          />

          <section className="insight-card context-card">
            <h2>
              <span className="insight-card-icon">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              Related pages
            </h2>
            <ul>
              {textSelectionContext?.related_pages.length ? (
                textSelectionContext.related_pages.map((relatedPage) => (
                  <li key={relatedPage.page_index}>
                    <strong>Page {relatedPage.page_label}</strong>
                    <span>{relatedPage.title}</span>
                  </li>
                ))
              ) : (
                <li className="waiting">
                  {getRelatedPagesMessage(
                    selection,
                    documentModel,
                    textSelectionContext,
                    relatedPagesStatus,
                  )}
                </li>
              )}
            </ul>
          </section>
        </aside>
      </div>

      {activeTutorial && (
        <div className="session-controls">
          <div className="session-dock">
            <button
              className={`icon-button dock-icon${
                realtimeTutor.isUserTurn ? " user-turn" : ""
              }`}
              type="button"
              onClick={() => void toggleUserTurn()}
              disabled={
                realtimeTutor.status !== "connected" ||
                realtimeTutor.isSubmittingUserTurn ||
                !learnerCanAsk
              }
              aria-label={
                realtimeTutor.isUserTurn
                  ? "Finish asking"
                  : selection
                    ? "Ask about the selection"
                    : guidedMode
                      ? "Ask about this page"
                      : "Ask about a selection"
              }
            >
              {realtimeTutor.isUserTurn ? (
                <Check size={22} />
              ) : (
                <Hand size={22} />
              )}
            </button>
            <div className="listening-status">{renderTutorStatus()}</div>
            <button
              className="icon-button dock-icon"
              type="button"
              onClick={() => setModal("transcript")}
              disabled={realtimeTutor.tutorTranscripts.length === 0}
              aria-label="Open transcript"
            >
              <MessageSquareText size={21} />
            </button>
            <span className="session-dock-spacer" aria-hidden="true" />
            {renderSessionAction()}
          </div>
        </div>
      )}

      {modal === "transcript" && (
        <TranscriptModal
          transcripts={realtimeTutor.tutorTranscripts}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "end-session" && (
        <ConfirmationModal
          eyebrow={`${modeLabel} session`}
          title="End this tutor session?"
          message="Your PDF will remain available. The current voice conversation will end."
          confirmLabel="End Session"
          icon={<LogOut size={23} />}
          onCancel={() => setModal(null)}
          onConfirm={endSession}
        />
      )}

      {modal === "delete-tutorial" && (
        <ConfirmationModal
          eyebrow="Document management"
          title="Delete this document?"
          message="The source PDF and its prepared tutorial data will be permanently deleted from this machine."
          confirmLabel={deletingTutorial ? "Deleting…" : "Delete Document"}
          icon={<Trash2 size={23} />}
          destructive
          busy={deletingTutorial}
          onCancel={() => setModal(null)}
          onConfirm={() => void deleteTutorial()}
        />
      )}

      {modal === "settings" && (
        <LearningSettingsDialog
          audioChangesDisabled={audioSettingsDisabled}
          requestMicrophonePermission={
            realtimeTutor.status !== "connected"
          }
          onSelectAudioInputDevice={
            realtimeTutor.selectAudioInputDevice
          }
          onSelectAudioOutputDevice={
            realtimeTutor.selectAudioOutputDevice
          }
          onClose={() => setModal(null)}
          onShowMessage={showToast}
        />
      )}

      <div className={`toast${toast ? " visible" : ""}`} aria-live="polite">
        {toast}
      </div>
    </main>
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

function TutorTranscriptCard({
  transcript,
  history,
  isStreaming,
  onOpen,
}: {
  transcript: string;
  history: string[];
  isStreaming: boolean;
  onOpen: () => void;
}) {
  const latestTranscript = transcript || history.at(-1) || "";

  return (
    <section className="insight-card compact-transcript-card">
      <h2>
        <span className="insight-card-icon">
          <MessageSquareText size={18} aria-hidden="true" />
        </span>
        Tutor response
      </h2>
      <p className={latestTranscript ? undefined : "selection-placeholder"}>
        {latestTranscript ||
          (isStreaming
            ? "The tutor is preparing a response…"
            : "The tutor’s response will appear here.")}
      </p>
      <button
        className="secondary-button transcript-open-button"
        type="button"
        onClick={onOpen}
        disabled={history.length === 0}
      >
        Open transcript
      </button>
    </section>
  );
}

function GuidedProgressCard({
  progress,
  connected,
  busy,
  hasNextPage,
  onContinue,
}: {
  progress: GuidedSegmentProgress | null;
  connected: boolean;
  busy: boolean;
  hasNextPage: boolean;
  onContinue: () => void;
}) {
  let buttonLabel = "Start the tutor";

  if (progress) {
    if (progress.pageComplete) {
      buttonLabel = hasNextPage ? "Next page" : "Document complete";
    } else if (busy) {
      buttonLabel = "Explaining…";
    } else if (progress.segmentComplete) {
      buttonLabel = "Continue";
    } else {
      buttonLabel = "Resume explanation";
    }
  }

  return (
    <section className="insight-card guided-progress-card">
      <h2>
        <span className="insight-card-icon">
          <Sparkles size={18} aria-hidden="true" />
        </span>
        Guided progress
      </h2>
      {progress ? (
        <>
          {progress.sectionTitle ? (
            <p className="guided-section-title">
              {progress.sectionTitle}
            </p>
          ) : null}
          <strong className="guided-segment-title">
            {progress.title}
          </strong>
          <p className="guided-segment-count">
            {progress.segmentCount > 0
              ? `Part ${progress.segmentNumber} of ${progress.segmentCount} on this page`
              : "This page has no prepared teaching segments."}
          </p>
        </>
      ) : (
        <p className="guided-progress-placeholder">
          Start the guided tutor to begin with the first teaching segment.
        </p>
      )}
      <button
        className="primary-button guided-continue-button"
        type="button"
        onClick={onContinue}
        disabled={
          !connected ||
          !progress ||
          busy ||
          (progress.pageComplete && !hasNextPage)
        }
      >
        {buttonLabel}
        {progress?.pageComplete && hasNextPage ? (
          <ChevronRight size={17} aria-hidden="true" />
        ) : null}
      </button>
    </section>
  );
}

function TranscriptModal({
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

function ConfirmationModal({
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

function useRelatedPages(
  tutorialId: string,
  model: DocumentModel | null,
  selection: DocumentSelection | null,
) {
  const [result, setResult] = useState<RelatedPagesResult | null>(null);
  const selectionKey = getSelectionKey(selection);
  const activeResult =
    result?.selectionKey === selectionKey ? result : null;
  const selectedPageHasChunks = Boolean(
    selection && model?.pages[selection.page_index - 1]?.chunks.length,
  );
  let status: RelatedPagesStatus = "idle";

  if (selection?.text && selectedPageHasChunks) {
    status = activeResult?.status ?? "loading";
  } else if (selection?.text) {
    status = "ready";
  }

  useEffect(() => {
    const controller = new AbortController();

    if (
      !model ||
      !selection?.text ||
      !selectionKey ||
      !selectedPageHasChunks
    ) {
      return () => controller.abort();
    }

    const activeSelection = selection;
    const activeSelectionKey = selectionKey;

    async function loadRelatedPages() {
      try {
        const context = await readRelatedPages(
          tutorialId,
          activeSelection,
          controller.signal,
        );
        setResult({
          selectionKey: activeSelectionKey,
          status: "ready",
          context,
        });
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setResult({
            selectionKey: activeSelectionKey,
            status: "error",
            context: null,
          });
        }
      }
    }

    void loadRelatedPages();
    return () => controller.abort();
  }, [
    model,
    selectedPageHasChunks,
    selection,
    selectionKey,
    tutorialId,
  ]);

  return {
    textSelectionContext: activeResult?.context ?? null,
    relatedPagesStatus: status,
  };
}

async function readTutorialData(
  tutorialId: string,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/tutorials/${tutorialId}`, { signal });
  const data = (await response.json()) as TutorialDataResponse;

  if (!response.ok || !data.tutorial || !data.model) {
    throw new Error(data.message ?? "The document could not be loaded.");
  }

  return {
    tutorial: data.tutorial,
    model: data.model,
  };
}

async function readRelatedPages(
  tutorialId: string,
  selection: DocumentSelection,
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/tutorials/${tutorialId}/related-pages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_index: selection.page_index,
        selection_text: selection.text,
      }),
      signal,
    },
  );
  const data = (await response.json()) as RelatedPagesResponse;

  if (!response.ok || !("text_selection" in data)) {
    throw new Error(
      data.message ?? "Related pages are temporarily unavailable.",
    );
  }

  return data.text_selection ?? null;
}

function getRelatedPagesMessage(
  selection: DocumentSelection | null,
  model: DocumentModel | null,
  context: TextSelectionContext | null,
  status: RelatedPagesStatus,
) {
  if (!selection) {
    return "Select text to find related pages.";
  }

  if (!selection.text) {
    return "No readable text was found in this selection.";
  }

  if (!model?.pages[selection.page_index - 1]?.chunks.length) {
    return "This page has no modeled content.";
  }

  if (status === "loading" || status === "idle") {
    return "Finding related pages…";
  }

  if (status === "error") {
    return "Related pages are temporarily unavailable.";
  }

  if (context) {
    return "No related pages were found in this document.";
  }

  return "This selection could not be matched to the page.";
}

function getSelectionKey(selection: DocumentSelection | null) {
  if (!selection?.text) {
    return null;
  }

  return JSON.stringify({
    page_index: selection.page_index,
    bounds: selection.bounds,
    text: selection.text,
  });
}

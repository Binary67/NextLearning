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
  useMemo,
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
import {
  buildTextSelectionContext,
  type DocumentModel,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";
import type { TutorialResponse } from "@/lib/tutorial";
import { useRealtimeTutor } from "@/lib/use-realtime-tutor";

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
  const textSelectionContext = useMemo(
    () =>
      documentModel && selection?.text
        ? buildTextSelectionContext(
            documentModel,
            selection.page_index,
            selection.text,
          )
        : null,
    [documentModel, selection],
  );
  const selectionPageLabel = selection
    ? (documentModel?.pages[selection.page_index - 1]?.page_label ??
      String(selection.page_index))
    : "";
  const realtimeTutor = useRealtimeTutor({
    documentId: activeTutorial?.id ?? null,
    documentModel,
    selection,
    audioInputDeviceId,
    audioOutputDeviceId,
  });
  const sessionActive =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.status === "connected";
  const audioSettingsDisabled =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn;
  const pageCount = documentModel?.page_count ?? 0;

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
        selection
      ) {
        event.preventDefault();
        void toggleUserTurn();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    modal,
    raiseHandShortcut,
    realtimeTutor.status,
    realtimeTutor.tutorTranscripts.length,
    selection,
    sessionActive,
    toggleUserTurn,
  ]);

  function changePage(pageIndex: number) {
    if (pageIndex < 1 || pageIndex > pageCount) {
      return;
    }

    setCurrentPage(pageIndex);
    setSelection(null);
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
    void realtimeTutor.start();
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
          <small>Tutor</small>
          <strong>Connecting…</strong>
        </span>
      );
    }

    if (realtimeTutor.status === "connected") {
      if (realtimeTutor.isUserTurn) {
        return (
          <span className="turn-state-copy">
            <small className="listening-label">
              <span className="listening-dot" aria-hidden="true" />
              Listening
            </small>
            <strong>Ask about the selected region</strong>
          </span>
        );
      }

      if (realtimeTutor.isSubmittingUserTurn) {
        return (
          <span className="turn-state-copy">
            <small>Your turn</small>
            <strong>Sending your question…</strong>
          </span>
        );
      }

      if (
        realtimeTutor.isTutorResponding ||
        realtimeTutor.isTutorSpeaking
      ) {
        return (
          <span className="turn-state-copy">
            <small>Tutor</small>
            <strong>
              {realtimeTutor.isTutorSpeaking ? "Speaking…" : "Thinking…"}
            </strong>
          </span>
        );
      }

      return (
        <span className="turn-state-copy">
          <small>Your turn</small>
          <strong>
            {selection
              ? `Press ${raiseHandShortcutLabel} to ask`
              : "Draw a rectangle on the PDF"}
          </strong>
        </span>
      );
    }

    if (realtimeTutor.status === "error") {
      return (
        <span className="turn-state-copy error">
          <small>Tutor unavailable</small>
          <strong>{realtimeTutor.error}</strong>
        </span>
      );
    }

    return (
      <span className="turn-state-copy">
        <small>Read and ask</small>
        <strong>
          {selection ? "Ready to start" : "Select something to discuss"}
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
        {realtimeTutor.status === "ended" ? "New Session" : "Start Tutor"}
      </button>
    );
  }

  return (
    <main className="app-shell dashboard-shell">
      <AppHeader
        activeSection="dashboard"
        dashboardHref={`/tutorials/${tutorialId}`}
        onCoursesClick={() =>
          showToast("Courses are not part of read-and-ask mode.")
        }
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
                  className="icon-button small"
                  type="button"
                  onClick={() => setModal("delete-tutorial")}
                  disabled={!activeTutorial}
                  aria-label="Delete document"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <NewTutorialButton variant="icon" />
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
                    disabled={currentPage <= 1}
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
                    disabled={currentPage >= pageCount}
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
                      : "Draw a rectangle around anything you want explained"}
                  </strong>
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
          <section className="insight-card selection-card">
            <h2>
              <span className="insight-card-icon">
                <ScanText size={18} aria-hidden="true" />
              </span>
              Active selection
            </h2>
            {selection ? (
              <>
                <strong>Page {selectionPageLabel}</strong>
                <p>
                  {selection.text ||
                    "This region has no native PDF text. The tutor will use the image."}
                </p>
                <button
                  className="secondary-button clear-selection-button"
                  type="button"
                  onClick={() => setSelection(null)}
                >
                  <X size={16} />
                  Clear selection
                </button>
              </>
            ) : (
              <p className="selection-placeholder">
                Draw a rectangle over a paragraph, formula, table, or diagram.
              </p>
            )}
          </section>

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
                  {selection?.text
                    ? "No reliable related pages found."
                    : "Select text to find related pages."}
                </li>
              )}
            </ul>
          </section>

          <TutorTranscriptCard
            transcript={realtimeTutor.currentTutorTranscript}
            history={realtimeTutor.tutorTranscripts}
            isStreaming={
              realtimeTutor.isTutorResponding ||
              realtimeTutor.isTutorSpeaking
            }
            onOpen={() => setModal("transcript")}
          />
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
                !selection
              }
              aria-label={
                realtimeTutor.isUserTurn
                  ? "Finish asking"
                  : "Ask about the selection"
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
          eyebrow="Read-and-ask session"
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
          message="The source PDF and its prepared document model will be permanently deleted from this machine."
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

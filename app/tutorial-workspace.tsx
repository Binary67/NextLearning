"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
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
  useRef,
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
import {
  findReviewCheckpoint,
  type ReviewCheckpoint,
} from "@/lib/learning-checkpoints";
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

type LearningResume = {
  pageIndex: number;
  chunkId: string | null;
};

type LearningStateResponse = {
  learningState?: {
    resume: LearningResume | null;
    concepts: Record<
      string,
      {
        lastChunkId: string;
      }
    >;
  };
  message?: string;
};

type RelatedPagesStatus = "idle" | "loading" | "ready" | "error";

type TutorMode = "read" | "guided" | "review";

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
  reviewConcept,
}: {
  tutorialId: string;
  reviewConcept?: string;
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
  const [tutorMode, setTutorMode] = useState<TutorMode>(
    reviewConcept ? "review" : "read",
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [resumeChunkId, setResumeChunkId] = useState<string | null>(
    null,
  );
  const [learningStateLoaded, setLearningStateLoaded] = useState(false);
  const [learningStateError, setLearningStateError] = useState("");
  const [reviewTarget, setReviewTarget] =
    useState<ReviewCheckpoint | null>(null);
  const [reviewError, setReviewError] = useState("");
  const lastPersistedResumeRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<DocumentSelection | null>(
    null,
  );
  const {
    raiseHandShortcut,
    raiseHandShortcutLabel,
    explanationStyle,
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
  const reviewMode = tutorMode === "review";
  const structuredMode = guidedMode || reviewMode;

  const realtimeTutor = useRealtimeTutor({
    documentId: activeTutorial?.id ?? null,
    documentModel,
    selection,
    textSelectionContext,
    relatedPagesLoading,
    explanationStyle,
    audioInputDeviceId,
    audioOutputDeviceId,
  });
  const sessionActive =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.status === "connected";
  const modeLabel = reviewMode
    ? "Concept review"
    : guidedMode
      ? "Guided tutor"
      : "Read and ask";
  const audioSettingsDisabled =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn ||
    realtimeTutor.isReplayingTutorAudio;
  const pageCount = documentModel?.page_count ?? 0;
  const guidedProgress =
    realtimeTutor.guidedSegmentProgress?.pageIndex === currentPage
      ? realtimeTutor.guidedSegmentProgress
      : null;
  const currentResumeChunkId =
    guidedMode && guidedProgress?.chunkId
      ? guidedProgress.chunkId
      : resumeChunkId;
  const learnerCanAsk =
    (structuredMode || Boolean(selection && !relatedPagesLoading)) &&
    !(reviewMode && guidedProgress?.segmentComplete);
  let learnerTurnPrompt = structuredMode
    ? `Press ${raiseHandShortcutLabel} to answer or ask about this part`
    : "Draw a rectangle on the PDF";

  if (reviewMode && guidedProgress?.segmentComplete) {
    learnerTurnPrompt = "Review complete";
  } else if (
    selection &&
    !reviewMode &&
    !guidedProgress?.learningPhase
  ) {
    learnerTurnPrompt = !structuredMode && relatedPagesLoading
      ? "Finding related pages…"
      : `Press ${raiseHandShortcutLabel} to ask about the selection`;
  }
  const tutorSourceText =
    structuredMode && realtimeTutor.status === "connected"
      ? guidedProgress?.sourceText ?? null
      : null;
  const guidedTurnBusy =
    realtimeTutor.isTutorResponding ||
    realtimeTutor.isTutorSpeaking ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn ||
    realtimeTutor.isReplayingTutorAudio;
  let pdfInstruction =
    "Draw a rectangle around anything you want explained";
  let askButtonLabel = "Select an area to ask";

  if (structuredMode) {
    pdfInstruction =
      reviewMode
        ? "Review the highlighted source passage"
        : "Follow along, or select a region for a narrower question";
    askButtonLabel = reviewMode ? "Answer review" : "Ask about this page";
  }

  if (
    selection &&
    !reviewMode &&
    !guidedProgress?.learningPhase
  ) {
    pdfInstruction = "Selection ready—ask your question";
    askButtonLabel = "Ask about selection";
  }

  if (realtimeTutor.isUserTurn) {
    askButtonLabel = structuredMode ? "Finish response" : "Finish asking";
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadTutorialData() {
      setDocumentLoading(true);
      setDocumentError("");
      setActiveTutorial(null);
      setDocumentModel(null);
      setSelection(null);
      setLearningStateLoaded(false);
      setLearningStateError("");
      setReviewTarget(null);
      setReviewError("");
      setTutorMode(reviewConcept ? "review" : "read");
      setCurrentPage(1);
      setResumeChunkId(null);
      lastPersistedResumeRef.current = null;

      try {
        const [data, learningStateResult] = await Promise.all([
          readTutorialData(tutorialId, controller.signal),
          readLearningState(tutorialId, controller.signal).then(
            (learningState) => ({ learningState, error: null }),
            (error: unknown) => ({ learningState: null, error }),
          ),
        ]);

        setActiveTutorial(data.tutorial);
        setDocumentModel(data.model);

        if (learningStateResult.learningState) {
          const learningState = learningStateResult.learningState;
          const resume = getValidResume(data.model, learningState.resume);

          lastPersistedResumeRef.current = JSON.stringify(
            learningState.resume,
          );
          setCurrentPage(resume?.pageIndex ?? 1);
          setResumeChunkId(resume?.chunkId ?? null);

          if (reviewConcept) {
            const reviewState = learningState.concepts[reviewConcept];
            const target = reviewState
              ? findReviewCheckpoint(
                  data.model,
                  reviewConcept,
                  reviewState.lastChunkId,
                )
              : null;

            if (target) {
              setReviewTarget(target);
              setCurrentPage(target.pageIndex);
            } else {
              setReviewError(
                "This concept review is no longer available for the saved passage.",
              );
            }
          }
        } else if (
          learningStateResult.error instanceof Error &&
          learningStateResult.error.name !== "AbortError"
        ) {
          setLearningStateError(learningStateResult.error.message);

          if (reviewConcept) {
            setReviewError(
              "The saved review context could not be loaded.",
            );
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setDocumentError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setDocumentLoading(false);
          setLearningStateLoaded(true);
        }
      }
    }

    void loadTutorialData();
    return () => controller.abort();
  }, [reviewConcept, tutorialId]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    if (
      !learningStateLoaded ||
      !documentModel ||
      reviewMode ||
      currentPage < 1 ||
      currentPage > documentModel.page_count
    ) {
      return;
    }

    const resume = {
      pageIndex: currentPage,
      chunkId: currentResumeChunkId,
    };
    const resumeKey = JSON.stringify(resume);

    if (resumeKey === lastPersistedResumeRef.current) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void writeLearningResume(
        tutorialId,
        resume,
        controller.signal,
      ).then(
        () => {
          lastPersistedResumeRef.current = resumeKey;
          setLearningStateError("");
        },
        (reason: unknown) => {
          if (reason instanceof Error && reason.name !== "AbortError") {
            setLearningStateError(reason.message);
          }
        },
      );
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    currentPage,
    documentModel,
    learningStateLoaded,
    currentResumeChunkId,
    reviewMode,
    tutorialId,
  ]);

  const toggleUserTurn = useCallback(async () => {
    const wasListening = realtimeTutor.isUserTurn;
    const actionSucceeded = await realtimeTutor.toggleUserTurn();

    if (!actionSucceeded) {
      return;
    }

    showToast(
      wasListening
        ? "Response sent. Waiting for the tutor."
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
      reviewMode ||
      (guidedMode &&
        (realtimeTutor.status === "connecting" ||
          Boolean(guidedProgress?.learningPhase)))
    ) {
      return;
    }

    setCurrentPage(pageIndex);
    setResumeChunkId(null);
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
    if (reviewMode) {
      if (reviewTarget) {
        void realtimeTutor.startReview(reviewTarget);
      }

      return;
    }

    if (guidedMode) {
      void realtimeTutor.startGuided(currentPage, resumeChunkId);
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
    if (guidedMode && guidedProgress?.chunkId) {
      setResumeChunkId(guidedProgress.chunkId);
    }

    setModal(null);
    showToast("Session ended.");
    void realtimeTutor.end();
  }

  function renderTutorStatus() {
    if (realtimeTutor.status === "connecting") {
      return (
        <span className="turn-state-copy">
          <small>Connecting</small>
          <strong>
            {structuredMode
              ? `Connecting and preparing this ${
                  reviewMode ? "review" : "page"
                }…`
              : "Connecting…"}
          </strong>
        </span>
      );
    }

    if (realtimeTutor.status === "connected") {
      if (realtimeTutor.isSubmittingUserTurn) {
        return (
          <span className="turn-state-copy">
            <small>Your turn</small>
            <strong>Sending your response…</strong>
          </span>
        );
      }

      if (realtimeTutor.isUserTurn) {
        return (
          <span className="turn-state-copy">
            <small className="listening-label">
              <span className="listening-dot" aria-hidden="true" />
              Listening
            </small>
            <strong>
              {guidedProgress?.learningPhase
                ? "Answer the active learning question"
                : selection
                  ? "Ask about the selected region"
                  : reviewMode
                  ? "Answer the review question"
                  : "Ask about this page"}
            </strong>
          </span>
        );
      }

      if (realtimeTutor.isReplayingTutorAudio) {
        return (
          <span className="turn-state-copy">
            <small>Tutor audio</small>
            <strong>Replaying tutor audio…</strong>
          </span>
        );
      }

      if (
        realtimeTutor.isTutorResponding ||
        realtimeTutor.isTutorSpeaking
      ) {
        let activity = structuredMode ? "Tutoring…" : "Thinking…";

        if (realtimeTutor.isTutorSpeaking) {
          activity = "Speaking…";
        }

        return (
          <span className="turn-state-copy">
            <small>Tutor</small>
            <strong>{activity}</strong>
          </span>
        );
      }

      return (
        <span className="turn-state-copy">
          <small>Your turn</small>
          <strong>{learnerTurnPrompt}</strong>
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

    if (realtimeTutor.status === "ended") {
      return (
        <span className="turn-state-copy">
          <small>Session</small>
          <strong>Session ended</strong>
        </span>
      );
    }

    return (
      <span className="turn-state-copy">
        <small>Ready</small>
        <strong>
          {guidedMode ? "Learn this paper step by step" : pdfInstruction}
        </strong>
      </span>
    );
  }

  function renderSessionAction() {
    if (realtimeTutor.status === "connecting") {
      return (
        <button
          className="primary-button tutor-session-action"
          type="button"
          disabled
        >
          {reviewMode
            ? "Starting review…"
            : guidedMode
              ? "Starting lesson…"
              : "Starting…"}
        </button>
      );
    }

    if (realtimeTutor.status === "connected") {
      return (
        <button
          className="secondary-button tutor-session-action"
          type="button"
          onClick={() => setModal("end-session")}
        >
          <LogOut size={20} />
          End session
        </button>
      );
    }

    let startLabel = reviewMode
      ? "Start review"
      : guidedMode
        ? "Start guided lesson"
        : "Start tutor";

    if (realtimeTutor.status === "ended") {
      startLabel = reviewMode
        ? "Review again"
        : guidedMode
          ? "Start new lesson"
          : "Start new session";
    }

    return (
      <button
        className="primary-button tutor-session-action"
        type="button"
        onClick={startTutor}
        disabled={
          !documentModel ||
          (reviewMode && (!learningStateLoaded || !reviewTarget))
        }
      >
        <Play size={20} />
        {startLabel}
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
                      onClick={() => setTutorMode("read")}
                      disabled={sessionActive}
                      aria-pressed={!guidedMode}
                    >
                      Read
                    </button>
                    <button
                      className={guidedMode ? "active" : undefined}
                      type="button"
                      onClick={() => setTutorMode("guided")}
                      disabled={sessionActive}
                      aria-pressed={guidedMode}
                    >
                      Tutor
                    </button>
                  </>
                )}
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
                <NewTutorialButton
                  variant="icon"
                  onQueued={() =>
                    showToast("Document added to the preparation queue.")
                  }
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
                      onClick={() => setModal("delete-tutorial")}
                      disabled={!activeTutorial}
                    >
                      <Trash2 size={17} />
                      Delete document
                    </button>
                  </div>
                </details>
              </div>
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
            <div className="workspace-content">
              <div className="pdf-content">
                <div className="pdf-page-bar">
                  <div className="pdf-page-controls">
                    <button
                      className="icon-button small"
                      type="button"
                      onClick={() => changePage(currentPage - 1)}
                      disabled={
                        currentPage <= 1 ||
                        reviewMode ||
                        (guidedMode &&
                          (realtimeTutor.status === "connecting" ||
                            Boolean(guidedProgress?.learningPhase)))
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
                        reviewMode ||
                        (guidedMode &&
                          (realtimeTutor.status === "connecting" ||
                            Boolean(guidedProgress?.learningPhase)))
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
                    tutorSourceText={tutorSourceText}
                    onSelectionChange={setSelection}
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

        <aside className="insights-column" aria-label={`${modeLabel} workspace`}>
          <section className="insight-card tutor-session-card">
            <h2>
              <span className="insight-card-icon">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              {modeLabel}
            </h2>
            <div className="tutor-session-status">
              {renderTutorStatus()}
            </div>
            {reviewError ? (
              <p className="learning-persistence-error">{reviewError}</p>
            ) : null}
            {learningStateError || realtimeTutor.persistenceError ? (
              <p className="learning-persistence-error" role="status">
                {realtimeTutor.persistenceError || learningStateError}
              </p>
            ) : null}
            {realtimeTutor.status === "connected" ? (
              <button
                className={`secondary-button tutor-ask-button${
                  realtimeTutor.isUserTurn ? " user-turn" : ""
                }`}
                type="button"
                onClick={() => void toggleUserTurn()}
                disabled={
                  realtimeTutor.isSubmittingUserTurn || !learnerCanAsk
                }
              >
                {realtimeTutor.isUserTurn ? (
                  <Check size={18} />
                ) : (
                  <Hand size={18} />
                )}
                {askButtonLabel}
              </button>
            ) : null}
            {renderSessionAction()}
            {reviewMode &&
            (reviewError ||
              realtimeTutor.status === "ended" ||
              realtimeTutor.status === "error") ? (
              <Link
                className="secondary-button review-back-link"
                href="/review"
              >
                Back to review
              </Link>
            ) : null}
          </section>

          {structuredMode ? (
            <GuidedProgressCard
              progress={guidedProgress}
              connected={realtimeTutor.status === "connected"}
              busy={guidedTurnBusy}
              hasNextPage={currentPage < pageCount}
              review={reviewMode}
              onContinue={continueGuided}
            />
          ) : null}

          <TutorResponseCard
            transcript={realtimeTutor.currentTutorTranscript}
            history={realtimeTutor.tutorTranscripts}
            isStreaming={
              realtimeTutor.isTutorResponding ||
              realtimeTutor.isTutorSpeaking
            }
            canReplayAudio={realtimeTutor.canReplayTutorAudio}
            isReplayingAudio={realtimeTutor.isReplayingTutorAudio}
            onReplayAudio={() => {
              void realtimeTutor.replayTutorAudio();
            }}
            onOpen={() => setModal("transcript")}
          />

          {!structuredMode || selection ? (
            <section className="insight-card context-card">
              <h2>
                <span className="insight-card-icon">
                  <ScanText size={18} aria-hidden="true" />
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
          ) : null}
        </aside>
      </div>

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
          explanationStyleChangesDisabled={sessionActive}
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

function TutorResponseCard({
  transcript,
  history,
  isStreaming,
  canReplayAudio,
  isReplayingAudio,
  onReplayAudio,
  onOpen,
}: {
  transcript: string;
  history: string[];
  isStreaming: boolean;
  canReplayAudio: boolean;
  isReplayingAudio: boolean;
  onReplayAudio: () => void;
  onOpen: () => void;
}) {
  const latestTranscript = transcript || history.at(-1) || "";

  return (
    <section className="insight-card tutor-response-card">
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
      <div className="tutor-response-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onReplayAudio}
          disabled={!canReplayAudio || isStreaming || isReplayingAudio}
        >
          <Play size={15} aria-hidden="true" />
          {isReplayingAudio ? "Replaying…" : "Replay"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onOpen}
          disabled={history.length === 0}
        >
          Transcript
        </button>
      </div>
    </section>
  );
}

function GuidedProgressCard({
  progress,
  connected,
  busy,
  hasNextPage,
  review,
  onContinue,
}: {
  progress: GuidedSegmentProgress | null;
  connected: boolean;
  busy: boolean;
  hasNextPage: boolean;
  review: boolean;
  onContinue: () => void;
}) {
  return (
    <section className="insight-card guided-progress-card">
      <h2>
        <span className="insight-card-icon">
          <Sparkles size={18} aria-hidden="true" />
        </span>
        {review ? "Review progress" : "Guided progress"}
      </h2>
      {progress ? (
        <>
          {progress.sectionTitle ? (
            <p className="guided-section-title">
              {progress.sectionTitle}
            </p>
          ) : null}
          <strong className="guided-segment-title">
            {progress.conceptName ?? progress.title}
          </strong>
          {progress.learningPhase ? (
            <p className="learning-checkpoint-status">
              {getLearningCheckpointLabel(
                progress.learningPhase,
                progress.attemptNumber,
              )}
            </p>
          ) : null}
          {progress.sourceText ? (
            <p className="guided-passage-preview">{progress.sourceText}</p>
          ) : null}
          <p className="guided-segment-count">
            {review
              ? "Focused review of the saved source passage"
              : progress.segmentCount > 0
              ? `Part ${progress.segmentNumber} of ${progress.segmentCount} on this page`
              : "This page has no prepared teaching segments."}
          </p>
        </>
      ) : (
        <p className="guided-progress-placeholder">
          {review
            ? "Start the review when you are ready to answer by voice."
            : "Start the guided lesson to begin with the first teaching segment."}
        </p>
      )}
      {review && progress?.segmentComplete ? (
        <div className="review-complete-actions">
          <strong className="guided-progress-complete">
            Review complete
          </strong>
          <Link className="primary-button" href="/review">
            Back to review
          </Link>
        </div>
      ) : progress?.pageComplete && !hasNextPage ? (
        <strong className="guided-progress-complete">Lesson complete</strong>
      ) : connected && progress && !progress.learningPhase && !review ? (
        <button
          className="primary-button guided-continue-button"
          type="button"
          onClick={onContinue}
          disabled={busy}
        >
          {getGuidedContinueButtonLabel(progress, busy, hasNextPage)}
          {progress.pageComplete && hasNextPage ? (
            <ChevronRight size={17} aria-hidden="true" />
          ) : null}
        </button>
      ) : null}
    </section>
  );
}

function getLearningCheckpointLabel(
  phase: GuidedSegmentProgress["learningPhase"],
  attemptNumber: GuidedSegmentProgress["attemptNumber"],
) {
  if (phase === "diagnostic") {
    return "Quick diagnostic · no penalty";
  }

  if (phase === "review") {
    return attemptNumber === 2
      ? "Review retry · final attempt"
      : "Retrieval review";
  }

  return attemptNumber === 2
    ? "Checkpoint retry · final attempt"
    : "Retrieval checkpoint";
}

function getGuidedContinueButtonLabel(
  progress: GuidedSegmentProgress,
  busy: boolean,
  hasNextPage: boolean,
) {
  if (progress.pageComplete) {
    return hasNextPage ? "Next page" : "Document complete";
  }

  if (busy) {
    return "Explaining…";
  }

  return progress.segmentComplete ? "Continue" : "Resume explanation";
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

async function readLearningState(
  tutorialId: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/tutorials/${tutorialId}/learning-state`,
    { signal },
  );
  const data = (await response.json()) as LearningStateResponse;

  if (!response.ok || !data.learningState) {
    throw new Error(
      data.message ?? "Your saved learning progress could not be loaded.",
    );
  }

  return data.learningState;
}

async function writeLearningResume(
  tutorialId: string,
  resume: {
    pageIndex: number;
    chunkId: string | null;
  },
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/tutorials/${tutorialId}/learning-state`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resume }),
      signal,
    },
  );

  if (response.ok) {
    return;
  }

  const data = (await response.json()) as { message?: string };
  throw new Error(
    data.message ?? "Your reading position could not be saved.",
  );
}

function getValidResume(
  model: DocumentModel,
  resume: LearningResume | null,
) {
  if (
    !resume ||
    !Number.isInteger(resume.pageIndex) ||
    resume.pageIndex < 1 ||
    resume.pageIndex > model.page_count
  ) {
    return null;
  }

  const chunkId =
    resume.chunkId &&
    model.pages[resume.pageIndex - 1].chunks.some(
      (chunk) => chunk.id === resume.chunkId,
    )
      ? resume.chunkId
      : null;

  return {
    pageIndex: resume.pageIndex,
    chunkId,
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

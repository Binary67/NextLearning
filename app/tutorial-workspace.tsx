"use client";

import { LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useApplicationShell } from "@/app/application-shell";
import {
  LearningSettingsDialog,
  useLearningSettings,
} from "@/app/learning-settings";
import type { DocumentSelection } from "@/lib/document-selection";
import {
  getDocumentChunkHighlightBounds,
  type DocumentChunk,
} from "@/lib/document-model";
import {
  type GuidedTutorMode,
  useRealtimeTutor,
} from "@/lib/use-realtime-tutor";

import {
  ConfirmationDialog,
  TranscriptDialog,
} from "./tutorial-workspace/dialogs";
import {
  DocumentPanel,
  type WorkspaceView,
} from "./tutorial-workspace/document-panel";
import { getHighlightedSourcePages } from "./tutorial-workspace/highlighted-pages";
import {
  findInitialReviewTarget,
  getInitialReviewError,
  getValidResume,
  useLearningResumePersistence,
} from "./tutorial-workspace/learning-resume";
import { TutorSidebar } from "./tutorial-workspace/tutor-sidebar";
import type {
  Modal,
  TutorialWorkspaceProps,
  TutorMode,
} from "./tutorial-workspace/types";
import { useRelatedPages } from "./tutorial-workspace/use-related-pages";

export function TutorialWorkspace({
  tutorialId,
  reviewConcept,
  initialTutorial,
  initialModel,
  initialLearningState,
  initialGuidedProgress,
  initialDocumentError,
  initialLearningStateError,
}: TutorialWorkspaceProps) {
  const router = useRouter();
  const {
    addTutorial,
    removeTutorial,
    registerSettings,
    showToast,
  } = useApplicationShell();
  const initialGuidedResume = initialModel
    ? getValidResume(
        initialModel,
        initialGuidedProgress?.cursor ?? null,
      )
    : null;
  const initialReviewTarget =
    reviewConcept && initialModel && initialLearningState
      ? findInitialReviewTarget(
          initialModel,
          initialLearningState,
          reviewConcept,
        )
      : null;
  const [modal, setModal] = useState<Modal>(null);
  const [deletingTutorial, setDeletingTutorial] = useState(false);
  const tutorMode: TutorMode = reviewConcept ? "review" : "guided";
  const [guidedTutorMode, setGuidedTutorMode] =
    useState<GuidedTutorMode>("learning");
  const [currentPage, setCurrentPage] = useState(
    initialReviewTarget?.pageIndex ??
      initialGuidedResume?.pageIndex ??
      1,
  );
  const [openedHighlightedChunkId, setOpenedHighlightedChunkId] =
    useState<string | null>(null);
  const [resumePageIndex, setResumePageIndex] = useState(
    initialGuidedResume?.pageIndex ?? 1,
  );
  const [resumeChunkId, setResumeChunkId] = useState<string | null>(
    initialGuidedResume?.chunkId ?? null,
  );
  const [learningStateError, setLearningStateError] = useState(
    initialLearningStateError,
  );
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
    initialModel,
    selection,
  );
  const relatedPagesLoading = relatedPagesStatus === "loading";
  const guidedMode = tutorMode === "guided";
  const reviewMode = tutorMode === "review";
  const activeLearningMode =
    guidedMode && guidedTutorMode === "learning";
  const reviewError = getInitialReviewError(
    reviewConcept,
    initialLearningState,
    initialReviewTarget,
    initialLearningStateError,
  );
  const realtimeTutor = useRealtimeTutor({
    documentId: initialTutorial?.id ?? null,
    documentModel: initialModel,
    selection,
    textSelectionContext,
    relatedPagesLoading,
    explanationStyle,
    audioInputDeviceId,
    audioOutputDeviceId,
  });
  const learningVisualStatus =
    realtimeTutor.learningVisualState.status;
  const [workspaceSelection, setWorkspaceSelection] = useState(() => ({
    learningVisualStatus,
    view: (learningVisualStatus === "generating"
      ? "visual"
      : "document") as WorkspaceView,
  }));

  if (learningVisualStatus !== workspaceSelection.learningVisualStatus) {
    let view = workspaceSelection.view;

    if (learningVisualStatus === "generating") {
      view = "visual";
    } else if (learningVisualStatus === "idle") {
      view = "document";
    }

    setWorkspaceSelection({ learningVisualStatus, view });
  }

  const sessionActive =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.status === "connected";
  const guidedSessionActive =
    guidedMode && realtimeTutor.status === "connected";
  const modeLabel = reviewMode
    ? "Concept review"
    : guidedTutorMode === "reading"
      ? "Guided reading"
      : "Active learning";
  const audioSettingsDisabled =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn ||
    realtimeTutor.isReplayingTutorAudio;
  const pageCount = initialModel?.page_count ?? 0;
  const guidedProgress = realtimeTutor.guidedSegmentProgress;
  const activeTeachingChunkId = guidedProgress?.chunkId ?? null;
  const activeTeachingChunk: DocumentChunk | null =
    activeTeachingChunkId && guidedProgress && initialModel
      ? (initialModel.pages[
          guidedProgress.pageIndex - 1
        ].chunks.find(
          (chunk) => chunk.id === activeTeachingChunkId,
        ) ?? null)
      : null;
  const highlightedSourcePages = getHighlightedSourcePages(activeTeachingChunk);
  const earliestHighlightedPage = highlightedSourcePages[0] ?? null;

  if (activeTeachingChunkId !== openedHighlightedChunkId) {
    setOpenedHighlightedChunkId(activeTeachingChunkId);

    if (activeTeachingChunkId && earliestHighlightedPage !== null) {
      setCurrentPage(earliestHighlightedPage);
      setSelection(null);
    }
  }

  const currentResumePageIndex =
    guidedMode && guidedProgress
      ? guidedProgress.pageIndex
      : resumePageIndex;
  const currentResumeChunkId =
    guidedMode && guidedProgress?.chunkId
      ? guidedProgress.chunkId
      : resumeChunkId;
  const learnerCanAsk = !(reviewMode && guidedProgress?.segmentComplete);
  let learnerTurnPrompt = reviewMode
    ? `Press ${raiseHandShortcutLabel} to answer the review question`
    : activeLearningMode
      ? `Press ${raiseHandShortcutLabel} to answer or ask about this part`
      : `Press ${raiseHandShortcutLabel} to ask about this part`;

  if (reviewMode && guidedProgress?.segmentComplete) {
    learnerTurnPrompt = "Review complete";
  } else if (selection && !reviewMode && !guidedProgress?.learningPhase) {
    learnerTurnPrompt = `Press ${raiseHandShortcutLabel} to ask about the selection`;
  }
  const tutorHighlightBounds =
    realtimeTutor.status === "connected" && activeTeachingChunk
      ? getDocumentChunkHighlightBounds(
          activeTeachingChunk,
          currentPage,
        )
      : [];
  const guidedTurnBusy =
    realtimeTutor.isTutorResponding ||
    realtimeTutor.isTutorSpeaking ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn ||
    realtimeTutor.isReplayingTutorAudio;
  let pdfInstruction = reviewMode
    ? "Review the highlighted source passage"
    : "Follow along, or select a region for a narrower question";
  let askButtonLabel = reviewMode ? "Answer review" : "Ask about this page";

  if (selection && !reviewMode && !guidedProgress?.learningPhase) {
    pdfInstruction = "Selection ready—ask your question";
    askButtonLabel = "Ask about selection";
  }

  if (realtimeTutor.isUserTurn) {
    askButtonLabel = "Finish response";
  }
  useEffect(() => {
    registerSettings({
      isOpen: modal === "settings",
      open: () => setModal("settings"),
    });

    return () => registerSettings(null);
  }, [modal, registerSettings]);

  useLearningResumePersistence({
    tutorialId,
    documentModel: initialModel,
    currentPage: currentResumePageIndex,
    chunkId: currentResumeChunkId,
    reviewMode,
    initialResume: initialLearningState?.resume ?? null,
    onError: setLearningStateError,
  });

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
    learnerCanAsk,
    modal,
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
      realtimeTutor.status === "connecting"
    ) {
      return;
    }

    setCurrentPage(pageIndex);
    setSelection(null);
  }

  function changeHighlightedPage(pageIndex: number) {
    if (
      !highlightedSourcePages.includes(pageIndex) ||
      realtimeTutor.status === "connecting"
    ) {
      return;
    }

    setCurrentPage(pageIndex);
    setSelection(null);
  }

  function returnToHighlight() {
    if (earliestHighlightedPage === null) {
      return;
    }

    setCurrentPage(earliestHighlightedPage);
    setSelection(null);
  }

  function downloadDocument() {
    if (!initialTutorial) {
      return;
    }

    const link = document.createElement("a");
    link.href = `${initialTutorial.url}?download=1`;
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
      removeTutorial(tutorialId);
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
      if (initialReviewTarget) {
        void realtimeTutor.startReview(initialReviewTarget);
      }
      return;
    }

    setCurrentPage(resumePageIndex);
    setSelection(null);
    void realtimeTutor.startGuided(
      resumePageIndex,
      resumeChunkId,
      guidedTutorMode,
    );
  }

  function continueGuided() {
    if (!guidedProgress) {
      return;
    }

    setSelection(null);

    if (guidedProgress.pageComplete) {
      if (guidedProgress.pageIndex < pageCount) {
        setCurrentPage(guidedProgress.pageIndex + 1);
        void realtimeTutor.explainPage(
          guidedProgress.pageIndex + 1,
        );
      }
      return;
    }

    setCurrentPage(guidedProgress.pageIndex);
    void realtimeTutor.continueGuided();
  }

  function endSession() {
    if (guidedMode && guidedProgress?.chunkId) {
      setResumePageIndex(guidedProgress.pageIndex);
      setResumeChunkId(guidedProgress.chunkId);
    }

    setModal(null);
    showToast("Session ended.");
    void realtimeTutor.end();
  }

  return (
    <>
      <main className="dashboard-layout">
        <DocumentPanel
          tutorial={initialTutorial}
          documentModel={initialModel}
          documentError={initialDocumentError}
          currentPage={currentPage}
          pageCount={pageCount}
          selection={selection}
          tutorHighlightBounds={tutorHighlightBounds}
          highlightedSourcePages={highlightedSourcePages}
          pdfInstruction={pdfInstruction}
          modeLabel={modeLabel}
          reviewMode={reviewMode}
          guidedSessionActive={guidedSessionActive}
          pageNavigationDisabled={
            realtimeTutor.status === "connecting"
          }
          learningVisualState={realtimeTutor.learningVisualState}
          visualCreationEnabled={
            realtimeTutor.status === "connected"
          }
          visualSessionStarting={
            realtimeTutor.status === "connecting"
          }
          visualSessionStartEnabled={
            !sessionActive &&
            (!reviewMode || initialReviewTarget !== null)
          }
          activeWorkspaceView={workspaceSelection.view}
          onChangePage={changePage}
          onChangeHighlightedPage={changeHighlightedPage}
          onReturnToHighlight={returnToHighlight}
          onCreateVisual={() =>
            void realtimeTutor.createLearningVisual(currentPage)
          }
          onStartTutor={startTutor}
          onSelectionChange={setSelection}
          onDownload={downloadDocument}
          onTutorialQueued={(tutorial) => {
            addTutorial(tutorial);
            showToast("Document added to the preparation queue.");
          }}
          onEndSession={() => setModal("end-session")}
          onDelete={() => setModal("delete-tutorial")}
          onWorkspaceViewChange={(view) =>
            setWorkspaceSelection((selection) => ({
              ...selection,
              view,
            }))
          }
        />
        <TutorSidebar
          modeLabel={modeLabel}
          tutorMode={tutorMode}
          guidedTutorMode={guidedTutorMode}
          sessionActive={sessionActive}
          guidedSessionActive={guidedSessionActive}
          status={realtimeTutor.status}
          tutorError={realtimeTutor.error}
          reviewError={reviewError}
          learningStateError={learningStateError}
          persistenceError={realtimeTutor.persistenceError}
          hasDocument={Boolean(initialModel)}
          hasReviewTarget={Boolean(initialReviewTarget)}
          selection={selection}
          textSelectionContext={textSelectionContext}
          relatedPagesStatus={relatedPagesStatus}
          documentModel={initialModel}
          guidedProgress={guidedProgress}
          hasNextPage={
            (guidedProgress?.pageIndex ?? resumePageIndex) <
            pageCount
          }
          learnerCanAsk={learnerCanAsk}
          learnerTurnPrompt={learnerTurnPrompt}
          pdfInstruction={pdfInstruction}
          askButtonLabel={askButtonLabel}
          guidedTurnBusy={guidedTurnBusy}
          isUserTurn={realtimeTutor.isUserTurn}
          isSubmittingUserTurn={realtimeTutor.isSubmittingUserTurn}
          isTutorResponding={realtimeTutor.isTutorResponding}
          isTutorSpeaking={realtimeTutor.isTutorSpeaking}
          canReplayTutorAudio={realtimeTutor.canReplayTutorAudio}
          isReplayingTutorAudio={realtimeTutor.isReplayingTutorAudio}
          currentTutorTranscript={realtimeTutor.currentTutorTranscript}
          tutorTranscripts={realtimeTutor.tutorTranscripts}
          onGuidedTutorModeChange={setGuidedTutorMode}
          onToggleUserTurn={() => void toggleUserTurn()}
          onStartTutor={startTutor}
          onContinueGuided={continueGuided}
          onEndSession={() => setModal("end-session")}
          onReplayAudio={() => void realtimeTutor.replayTutorAudio()}
          onOpenTranscript={() => setModal("transcript")}
        />
      </main>

      {modal === "transcript" && (
        <TranscriptDialog
          transcripts={realtimeTutor.tutorTranscripts}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "end-session" && (
        <ConfirmationDialog
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
        <ConfirmationDialog
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
          requestMicrophonePermission={realtimeTutor.status !== "connected"}
          onSelectAudioInputDevice={realtimeTutor.selectAudioInputDevice}
          onSelectAudioOutputDevice={realtimeTutor.selectAudioOutputDevice}
          onClose={() => setModal(null)}
          onShowMessage={showToast}
        />
      )}
    </>
  );
}

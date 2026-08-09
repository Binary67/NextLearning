"use client";

import { LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useApplicationShell } from "@/app/application-shell";
import {
  LearningSettingsDialog,
  useLearningSettings,
} from "@/app/learning-settings";
import {
  type GuidedTutorMode,
  useRealtimeTutor,
} from "@/lib/use-realtime-tutor";

import {
  ConfirmationDialog,
  TranscriptDialog,
} from "./dialogs";
import { DocumentPanel } from "./document-panel";
import {
  findInitialReviewTarget,
  getInitialReviewError,
  getValidResume,
  useLearningResumePersistence,
} from "./learning-resume";
import { TutorSidebar } from "./tutor-sidebar";
import type {
  Modal,
  TutorialWorkspaceProps,
  TutorMode,
  WorkspaceView,
} from "./types";
import { useRelatedPages } from "./use-related-pages";
import { useWorkspaceActions } from "./use-workspace-actions";
import {
  getWorkspaceNavigation,
  useWorkspaceNavigationState,
} from "./use-workspace-navigation";
import { useWorkspaceShortcuts } from "./use-workspace-shortcuts";

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
  const tutorMode: TutorMode = reviewConcept ? "review" : "guided";
  const [guidedTutorMode, setGuidedTutorMode] =
    useState<GuidedTutorMode>("learning");
  const [learningStateError, setLearningStateError] = useState(
    initialLearningStateError,
  );
  const {
    raiseHandShortcut,
    raiseHandShortcutLabel,
    explanationStyle,
    audioInputDeviceId,
    audioOutputDeviceId,
  } = useLearningSettings();
  const guidedMode = tutorMode === "guided";
  const reviewMode = tutorMode === "review";
  const navigationState = useWorkspaceNavigationState({
    initialPageIndex:
      initialReviewTarget?.pageIndex ??
      initialGuidedResume?.pageIndex ??
      1,
    initialResume: initialGuidedResume,
  });
  const { textSelectionContext, relatedPagesStatus } = useRelatedPages(
    tutorialId,
    initialModel,
    navigationState.selection,
  );
  const relatedPagesLoading = relatedPagesStatus === "loading";
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
    selection: navigationState.selection,
    textSelectionContext,
    relatedPagesLoading,
    explanationStyle,
    audioInputDeviceId,
    audioOutputDeviceId,
  });
  const workspaceNavigation = getWorkspaceNavigation({
    ...navigationState,
    initialModel,
    reviewMode,
    guidedMode,
    realtimeTutorStatus: realtimeTutor.status,
    guidedProgress: realtimeTutor.guidedSegmentProgress,
  });
  const {
    currentPage,
    currentResumeChunkId,
    currentResumePageIndex,
    highlightedSourcePages,
    pageCount,
    resumeChunkId,
    resumePageIndex,
    selection,
    setCurrentPage,
    setResumeChunkId,
    setResumePageIndex,
    setSelection,
    tutorHighlightBounds,
    changePage,
    changeHighlightedPage,
    returnToHighlight,
  } = workspaceNavigation;
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
  const guidedProgress = realtimeTutor.guidedSegmentProgress;
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

  const {
    continueGuided,
    deleteTutorial,
    deletingTutorial,
    downloadDocument,
    endSession,
    startTutor,
    toggleUserTurn,
  } = useWorkspaceActions({
    tutorialId,
    tutorial: initialTutorial,
    reviewMode,
    guidedMode,
    initialReviewTarget,
    guidedTutorMode,
    resumePageIndex,
    resumeChunkId,
    guidedProgress,
    pageCount,
    realtimeTutor,
    raiseHandShortcutLabel,
    setCurrentPage,
    setSelection,
    setResumePageIndex,
    setResumeChunkId,
    setModal,
    onRemoveTutorial: removeTutorial,
    onShowToast: showToast,
  });

  useWorkspaceShortcuts({
    learnerCanAsk,
    modal,
    raiseHandShortcut,
    realtimeTutorStatus: realtimeTutor.status,
    sessionActive,
    transcriptCount: realtimeTutor.tutorTranscripts.length,
    setModal,
    toggleUserTurn,
  });

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
          currentPage={currentPage}
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
          learningVisualGenerating={learningVisualStatus === "generating"}
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
          requestTechnicalLessonAction={
            realtimeTutor.requestTechnicalLessonAction
          }
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

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import type { ReviewCheckpoint } from "@/lib/learning-checkpoints";
import type { DocumentSelection } from "@/lib/document-selection";
import type {
  GuidedSegmentProgress,
  GuidedTutorMode,
  useRealtimeTutor,
} from "@/lib/use-realtime-tutor";
import type { TutorialResponse } from "@/lib/tutorial";

import type { Modal } from "./types";

type RealtimeTutor = ReturnType<typeof useRealtimeTutor>;

export function useWorkspaceActions({
  tutorialId,
  tutorial,
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
  onRemoveTutorial,
  onShowToast,
}: {
  tutorialId: string;
  tutorial: TutorialResponse | null;
  reviewMode: boolean;
  guidedMode: boolean;
  initialReviewTarget: ReviewCheckpoint | null;
  guidedTutorMode: GuidedTutorMode;
  resumePageIndex: number;
  resumeChunkId: string | null;
  guidedProgress: GuidedSegmentProgress | null;
  pageCount: number;
  realtimeTutor: RealtimeTutor;
  raiseHandShortcutLabel: string;
  setCurrentPage: (pageIndex: number) => void;
  setSelection: (selection: DocumentSelection | null) => void;
  setResumePageIndex: (pageIndex: number) => void;
  setResumeChunkId: (chunkId: string | null) => void;
  setModal: (modal: Modal) => void;
  onRemoveTutorial: (tutorialId: string) => void;
  onShowToast: (message: string) => void;
}) {
  const router = useRouter();
  const [deletingTutorial, setDeletingTutorial] = useState(false);

  const toggleUserTurn = useCallback(async () => {
    const wasListening = realtimeTutor.isUserTurn;
    const actionSucceeded = await realtimeTutor.toggleUserTurn();

    if (!actionSucceeded) {
      return;
    }

    onShowToast(
      wasListening
        ? "Response sent. Waiting for the tutor."
        : `Listening. Press ${raiseHandShortcutLabel} or tap the check when you finish.`,
    );
  }, [
    onShowToast,
    raiseHandShortcutLabel,
    realtimeTutor,
  ]);

  function downloadDocument() {
    if (!tutorial) {
      return;
    }

    const link = document.createElement("a");
    link.href = `${tutorial.url}?download=1`;
    link.click();
    onShowToast("Document download started.");
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
      onRemoveTutorial(tutorialId);
      router.replace("/library");
    } catch (error) {
      onShowToast(
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
    onShowToast("Session ended.");
    void realtimeTutor.end();
  }

  return {
    continueGuided,
    deleteTutorial,
    deletingTutorial,
    downloadDocument,
    endSession,
    startTutor,
    toggleUserTurn,
  };
}

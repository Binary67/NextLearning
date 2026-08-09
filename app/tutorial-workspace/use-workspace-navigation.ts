import { useState } from "react";

import {
  getDocumentChunkHighlightBounds,
  type DocumentChunk,
  type DocumentModel,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";
import type {
  GuidedSegmentProgress,
  RealtimeTutorStatus,
} from "@/lib/use-realtime-tutor";

import { getHighlightedSourcePages } from "./highlighted-pages";
import type { LearningResume } from "./types";

export function useWorkspaceNavigationState({
  initialPageIndex,
  initialResume,
}: {
  initialPageIndex: number;
  initialResume: LearningResume | null;
}) {
  const [currentPage, setCurrentPage] = useState(initialPageIndex);
  const [openedHighlightedChunkId, setOpenedHighlightedChunkId] =
    useState<string | null>(null);
  const [resumePageIndex, setResumePageIndex] = useState(
    initialResume?.pageIndex ?? 1,
  );
  const [resumeChunkId, setResumeChunkId] = useState<string | null>(
    initialResume?.chunkId ?? null,
  );
  const [selection, setSelection] = useState<DocumentSelection | null>(
    null,
  );

  return {
    currentPage,
    openedHighlightedChunkId,
    resumeChunkId,
    resumePageIndex,
    selection,
    setCurrentPage,
    setOpenedHighlightedChunkId,
    setResumeChunkId,
    setResumePageIndex,
    setSelection,
  };
}

export function getWorkspaceNavigation({
  initialModel,
  currentPage,
  openedHighlightedChunkId,
  resumeChunkId,
  resumePageIndex,
  selection,
  setCurrentPage,
  setOpenedHighlightedChunkId,
  setResumeChunkId,
  setResumePageIndex,
  setSelection,
  reviewMode,
  guidedMode,
  realtimeTutorStatus,
  guidedProgress,
}: ReturnType<typeof useWorkspaceNavigationState> & {
  initialModel: DocumentModel | null;
  reviewMode: boolean;
  guidedMode: boolean;
  realtimeTutorStatus: RealtimeTutorStatus;
  guidedProgress: GuidedSegmentProgress | null;
}) {
  const pageCount = initialModel?.page_count ?? 0;
  const activeTeachingChunkId = guidedProgress?.chunkId ?? null;
  const activeTeachingChunk: DocumentChunk | null =
    activeTeachingChunkId && guidedProgress && initialModel
      ? (initialModel.pages[
          guidedProgress.pageIndex - 1
        ].chunks.find(
          (chunk) => chunk.id === activeTeachingChunkId,
        ) ?? null)
      : null;
  const highlightedSourcePages = getHighlightedSourcePages(
    activeTeachingChunk,
  );
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
  const tutorHighlightBounds =
    realtimeTutorStatus === "connected" && activeTeachingChunk
      ? getDocumentChunkHighlightBounds(
          activeTeachingChunk,
          currentPage,
        )
      : [];

  function changePage(pageIndex: number) {
    if (
      pageIndex < 1 ||
      pageIndex > pageCount ||
      reviewMode ||
      realtimeTutorStatus === "connecting"
    ) {
      return;
    }

    setCurrentPage(pageIndex);
    setSelection(null);
  }

  function changeHighlightedPage(pageIndex: number) {
    if (
      !highlightedSourcePages.includes(pageIndex) ||
      realtimeTutorStatus === "connecting"
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

  return {
    changeHighlightedPage,
    changePage,
    currentPage,
    currentResumeChunkId,
    currentResumePageIndex,
    earliestHighlightedPage,
    highlightedSourcePages,
    pageCount,
    returnToHighlight,
    resumeChunkId,
    resumePageIndex,
    selection,
    setCurrentPage,
    setResumeChunkId,
    setResumePageIndex,
    setSelection,
    tutorHighlightBounds,
  };
}

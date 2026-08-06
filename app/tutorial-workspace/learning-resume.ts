"use client";

import { useEffect, useRef } from "react";

import type { DocumentModel } from "@/lib/document-model";
import {
  findReviewCheckpoint,
  type ReviewCheckpoint,
} from "@/lib/learning-checkpoints";

import type {
  InitialLearningState,
  LearningResume,
} from "./types";

export function useLearningResumePersistence({
  tutorialId,
  documentModel,
  currentPage,
  chunkId,
  reviewMode,
  initialResume,
  onError,
}: {
  tutorialId: string;
  documentModel: DocumentModel | null;
  currentPage: number;
  chunkId: string | null;
  reviewMode: boolean;
  initialResume: LearningResume | null;
  onError: (message: string) => void;
}) {
  const lastPersistedResumeRef = useRef<string | null>(
    JSON.stringify(initialResume),
  );

  useEffect(() => {
    if (
      !documentModel ||
      reviewMode ||
      currentPage < 1 ||
      currentPage > documentModel.page_count
    ) {
      return;
    }

    const resume = {
      pageIndex: currentPage,
      chunkId,
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
          onError("");
        },
        (reason: unknown) => {
          if (reason instanceof Error && reason.name !== "AbortError") {
            onError(reason.message);
          }
        },
      );
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    chunkId,
    currentPage,
    documentModel,
    onError,
    reviewMode,
    tutorialId,
  ]);
}

async function writeLearningResume(
  tutorialId: string,
  resume: LearningResume,
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

export function getValidResume(
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

export function findInitialReviewTarget(
  model: DocumentModel,
  learningState: InitialLearningState,
  reviewConcept: string,
) {
  const reviewState = learningState.concepts[reviewConcept];

  return reviewState
    ? findReviewCheckpoint(
        model,
        reviewConcept,
        reviewState.lastChunkId,
      )
    : null;
}

export function getInitialReviewError(
  reviewConcept: string | undefined,
  learningState: InitialLearningState | null,
  reviewTarget: ReviewCheckpoint | null,
  learningStateError: string,
) {
  if (!reviewConcept || reviewTarget) {
    return "";
  }

  return learningStateError || !learningState
    ? "The saved review context could not be loaded."
    : "This concept review is no longer available for the saved passage.";
}

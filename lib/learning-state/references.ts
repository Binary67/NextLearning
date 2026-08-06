import type { DocumentModel } from "@/lib/document-model";
import {
  type LearningAttemptInput,
  type LearningSessionInput,
  type LearningState,
  LearningStateInputError,
} from "@/lib/learning-state/types";

export function validateResumeReferences(
  resume: LearningState["resume"],
  model: DocumentModel,
) {
  if (resume === null) {
    return;
  }

  const page = model.pages.find(
    (item) => item.page_index === resume.pageIndex,
  );

  if (
    !page ||
    (resume.chunkId !== null &&
      !page.chunks.some((chunk) => chunk.id === resume.chunkId))
  ) {
    throw new LearningStateInputError(
      "The resume position is not available in this document.",
    );
  }
}

export function validateAttemptReferences(
  input: LearningAttemptInput,
  model: DocumentModel,
) {
  const chunkIds = new Set(
    model.pages.flatMap((page) =>
      page.chunks.map((chunk) => chunk.id),
    ),
  );
  const conceptIds = new Set(
    model.concepts.map((concept) => concept.id),
  );

  if (
    !chunkIds.has(input.chunkId) ||
    input.conceptIds.some((conceptId) => !conceptIds.has(conceptId))
  ) {
    throw new LearningStateInputError(
      "The learning attempt references unavailable document content.",
    );
  }
}

export function validateSessionReferences(
  input: LearningSessionInput,
  model: DocumentModel,
) {
  const conceptIds = new Set(
    model.concepts.map((concept) => concept.id),
  );

  if (
    input.conceptsPracticed.some(
      (conceptId) => !conceptIds.has(conceptId),
    )
  ) {
    throw new LearningStateInputError(
      "The learning session references unavailable concepts.",
    );
  }
}

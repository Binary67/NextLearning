import {
  getDocumentChunkHighlightBounds,
  getDocumentChunkSourceText,
  type DocumentModel,
} from "@/lib/document-model";
import type {
  CheckpointSelection,
  LearningLoopState,
} from "@/lib/learning-checkpoints";
import { transitionLearningLoop } from "@/lib/learning-checkpoints";
import type { GuidedSegmentContext } from "@/lib/guided-segment-context";
import {
  buildLearningLoopToolAction,
} from "@/lib/realtime-tutor/instructions";
import {
  postGuidedProgressEvent,
  postLearningAttempt,
} from "@/lib/realtime-tutor/persistence";
import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";
import type { ValidatedLearningAttempt } from "@/lib/realtime-tutor/tools/record-learning-attempt";
import { getErrorMessage } from "@/lib/realtime-tutor/transport";

export function selectGuidedSegment(
  runtime: RealtimeTutorRuntime,
  model: DocumentModel,
  pageIndex: number,
  segmentIndex: number,
) {
  const page = model.pages[pageIndex - 1];
  const segment = page.chunks[segmentIndex];

  runtime.guidedSegmentStateRef.current = {
    pageIndex,
    segmentIndex,
    complete: false,
  };
  runtime.setGuidedSegmentProgress({
    pageIndex,
    sectionTitle: segment.section_title,
    title: segment.title,
    sourceText: getDocumentChunkSourceText(segment),
    highlightBounds: getDocumentChunkHighlightBounds(segment, pageIndex),
    chunkId: segment.id,
    conceptName: null,
    learningPhase: null,
    attemptNumber: null,
    segmentNumber: segmentIndex + 1,
    segmentCount: page.chunks.length,
    segmentComplete: false,
    pageComplete: false,
  });
  persistGuidedProgress(runtime, {
    type: "segment_started",
    pageIndex,
    chunkId: segment.id,
  });
}

export function setEmptyGuidedPage(
  runtime: RealtimeTutorRuntime,
  pageIndex: number,
) {
  runtime.guidedSegmentStateRef.current = {
    pageIndex,
    segmentIndex: null,
    complete: true,
  };
  runtime.setGuidedSegmentProgress({
    pageIndex,
    sectionTitle: "",
    title: "No instructional content on this page",
    sourceText: "",
    highlightBounds: [],
    chunkId: null,
    conceptName: null,
    learningPhase: null,
    attemptNumber: null,
    segmentNumber: 0,
    segmentCount: 0,
    segmentComplete: true,
    pageComplete: true,
  });
  persistGuidedProgress(runtime, {
    type: "empty_page_completed",
    pageIndex,
  });
}

export function setGuidedSegmentCompletion(
  runtime: RealtimeTutorRuntime,
  complete: boolean,
) {
  const guidedSegment = runtime.guidedSegmentStateRef.current;
  const wasComplete = guidedSegment?.complete ?? false;

  if (guidedSegment) {
    runtime.guidedSegmentStateRef.current = {
      ...guidedSegment,
      complete,
    };
  }

  runtime.setGuidedSegmentProgress((progress) =>
    progress
      ? {
          ...progress,
          segmentComplete: complete,
          pageComplete:
            complete &&
            progress.segmentNumber === progress.segmentCount,
        }
      : progress,
  );

  if (
    complete &&
    !wasComplete &&
    guidedSegment &&
    guidedSegment.segmentIndex !== null
  ) {
    const chunk = runtime.optionsRef.current.documentModel?.pages[
      guidedSegment.pageIndex - 1
    ]?.chunks[guidedSegment.segmentIndex];

    if (chunk) {
      persistGuidedProgress(runtime, {
        type: "segment_completed",
        pageIndex: guidedSegment.pageIndex,
        chunkId: chunk.id,
      });
    }
  }
}

export function startLearningCheckpoint(
  runtime: RealtimeTutorRuntime,
  selection: CheckpointSelection,
  state: LearningLoopState,
  surroundingContext: GuidedSegmentContext | null = null,
) {
  runtime.activeLearningCheckpointRef.current = {
    selection,
    state,
    surroundingContext,
  };
  runtime.setGuidedSegmentProgress((progress) =>
    progress
      ? {
          ...progress,
          conceptName: selection.concept.name,
          learningPhase: state.phase,
          attemptNumber: state.attemptNumber,
        }
      : progress,
  );
}

export async function recordLearningAttempt(
  runtime: RealtimeTutorRuntime,
  attempt: ValidatedLearningAttempt,
) {
  const learningCheckpoint =
    runtime.activeLearningCheckpointRef.current;
  const tutorSession = runtime.activeTutorSessionRef.current;
  const documentId = runtime.optionsRef.current.documentId;

  if (!learningCheckpoint || !tutorSession || !documentId) {
    throw new Error("The active learning session is unavailable.");
  }

  const transition = transitionLearningLoop(
    learningCheckpoint.state,
    attempt.result,
  );

  tutorSession.conceptsPracticed.add(attempt.conceptId);

  if (transition.state) {
    runtime.activeLearningCheckpointRef.current = {
      ...learningCheckpoint,
      state: transition.state,
    };
    runtime.setGuidedSegmentProgress((progress) =>
      progress
        ? {
            ...progress,
            learningPhase: transition.state?.phase ?? null,
            attemptNumber:
              transition.state?.attemptNumber ?? null,
          }
        : progress,
    );
  } else {
    runtime.activeLearningCheckpointRef.current = null;
    setGuidedSegmentCompletion(runtime, true);
    runtime.setGuidedSegmentProgress((progress) =>
      progress
        ? {
            ...progress,
            learningPhase: null,
            attemptNumber: null,
          }
        : progress,
    );
  }

  let recorded = true;

  try {
    await postLearningAttempt(documentId, {
      sessionId: tutorSession.id,
      phase: attempt.phase,
      chunkId: attempt.chunkId,
      conceptIds: [attempt.conceptId],
      result: attempt.result,
      confidence: null,
      misconception: attempt.misconception,
    });
    runtime.setPersistenceError("");
  } catch (reason) {
    recorded = false;
    runtime.setPersistenceError(
      getErrorMessage(
        reason,
        "This learning attempt could not be saved.",
      ),
    );
  }

  return {
    recorded,
    next_action: buildLearningLoopToolAction(
      transition.action,
      learningCheckpoint.selection,
      learningCheckpoint.surroundingContext,
    ),
  };
}

function persistGuidedProgress(
  runtime: RealtimeTutorRuntime,
  event: Parameters<typeof postGuidedProgressEvent>[1],
) {
  const documentId = runtime.optionsRef.current.documentId;

  if (!documentId) {
    return;
  }

  void postGuidedProgressEvent(documentId, event).then(
    () => {
      runtime.setPersistenceError("");
    },
    (reason: unknown) => {
      runtime.setPersistenceError(
        getErrorMessage(
          reason,
          "Your guided-reading progress could not be saved.",
        ),
      );
    },
  );
}

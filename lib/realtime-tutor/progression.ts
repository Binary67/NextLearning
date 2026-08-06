import type { DocumentModel } from "@/lib/document-model";
import type {
  CheckpointSelection,
  LearningLoopState,
} from "@/lib/learning-checkpoints";
import { transitionLearningLoop } from "@/lib/learning-checkpoints";
import type { GuidedSegmentContext } from "@/lib/guided-segment-context";
import {
  buildLearningLoopToolAction,
} from "@/lib/realtime-tutor/instructions";
import { postLearningAttempt } from "@/lib/realtime-tutor/persistence";
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
    sourceText: segment.source_text,
    highlightBounds: segment.highlight_bounds,
    chunkId: segment.id,
    conceptName: null,
    learningPhase: null,
    attemptNumber: null,
    segmentNumber: segmentIndex + 1,
    segmentCount: page.chunks.length,
    segmentComplete: false,
    pageComplete: false,
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
}

export function setGuidedSegmentCompletion(
  runtime: RealtimeTutorRuntime,
  complete: boolean,
) {
  const guidedSegment = runtime.guidedSegmentStateRef.current;

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

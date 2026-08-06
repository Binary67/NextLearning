import type { DocumentModel } from "@/lib/document-model";
import {
  getGuidedSegmentContext,
} from "@/lib/guided-segment-context";
import {
  selectPrimaryCheckpoint,
  type ReviewCheckpoint,
} from "@/lib/learning-checkpoints";
import { createRealtimeResponseState, supersedeRealtimeResponse } from "@/lib/realtime-response-state";
import {
  clearSelectionContext,
  replacePageContext,
} from "@/lib/realtime-tutor/context";
import { sendEventAndWait } from "@/lib/realtime-tutor/event-transport";
import {
  buildDiagnosticPromptInstructions,
  buildGuidedSegmentInstructions,
  buildReviewPromptInstructions,
} from "@/lib/realtime-tutor/instructions";
import {
  selectGuidedSegment,
  setEmptyGuidedPage,
  startLearningCheckpoint,
} from "@/lib/realtime-tutor/progression";
import type {
  GuidedTutorMode,
  RealtimeTutorRuntime,
  RealtimeTutorStatus,
  TutorSessionMode,
} from "@/lib/realtime-tutor/types";
import {
  findChunkIndex,
  getErrorMessage,
  isValidPageIndex,
  readInvalidPageMessage,
} from "@/lib/realtime-tutor/transport";

type ConnectSession = (
  mode: TutorSessionMode,
  guidedTutorMode?: GuidedTutorMode | null,
) => Promise<boolean | undefined>;

type CancelTutorOutput = () => void;

export async function startGuided(
  runtime: RealtimeTutorRuntime,
  connectSession: ConnectSession,
  pageIndex: number,
  chunkId: string | null,
  guidedTutorMode: GuidedTutorMode,
  cancelTutorOutput: CancelTutorOutput,
) {
  const documentModel = runtime.optionsRef.current.documentModel;

  if (
    !documentModel ||
    !isValidPageIndex(documentModel, pageIndex)
  ) {
    runtime.setError(
      readInvalidPageMessage(documentModel, pageIndex),
    );
    runtime.setStatus("error");
    return;
  }

  const connected = await connectSession("guided", guidedTutorMode);

  if (connected) {
    await explainPageInConnectedSession(
      runtime,
      documentModel,
      pageIndex,
      findChunkIndex(documentModel, pageIndex, chunkId),
      cancelTutorOutput,
    );
  }
}

export async function startReview(
  runtime: RealtimeTutorRuntime,
  connectSession: ConnectSession,
  review: ReviewCheckpoint,
  cancelTutorOutput: CancelTutorOutput,
) {
  const documentModel = runtime.optionsRef.current.documentModel;

  if (
    !documentModel ||
    !isValidPageIndex(documentModel, review.pageIndex)
  ) {
    runtime.setError(
      readInvalidPageMessage(documentModel, review.pageIndex),
    );
    runtime.setStatus("error");
    return;
  }

  const connected = await connectSession("review");

  if (connected) {
    await beginReviewInConnectedSession(
      runtime,
      documentModel,
      review,
      cancelTutorOutput,
    );
  }
}

export async function explainPage(
  runtime: RealtimeTutorRuntime,
  pageIndex: number,
  cancelTutorOutput: CancelTutorOutput,
) {
  const documentModel = runtime.optionsRef.current.documentModel;

  if (runtime.dataChannelRef.current?.readyState !== "open") {
    runtime.setError("Start the guided tutor before explaining a page.");
    return false;
  }

  if (
    runtime.sessionModeRef.current !== "guided" ||
    !documentModel ||
    !isValidPageIndex(documentModel, pageIndex)
  ) {
    runtime.setError(
      runtime.sessionModeRef.current !== "guided"
        ? "This tutor session is not in guided mode."
        : readInvalidPageMessage(documentModel, pageIndex),
    );
    return false;
  }

  return explainPageInConnectedSession(
    runtime,
    documentModel,
    pageIndex,
    0,
    cancelTutorOutput,
  );
}

async function explainPageInConnectedSession(
  runtime: RealtimeTutorRuntime,
  model: DocumentModel,
  pageIndex: number,
  segmentIndex: number,
  cancelTutorOutput: CancelTutorOutput,
) {
  try {
    cancelTutorOutput();
    await clearSelectionContext(runtime);
    await replacePageContext(runtime, model, pageIndex, "active");
    const chunks = model.pages[pageIndex - 1].chunks;

    if (chunks.length === 0) {
      setEmptyGuidedPage(runtime, pageIndex);
      runtime.setError("");
      return true;
    }

    await explainGuidedSegment(
      runtime,
      model,
      pageIndex,
      segmentIndex,
      cancelTutorOutput,
    );
    runtime.setError("");
    return true;
  } catch (reason) {
    runtime.setIsTutorResponding(false);
    runtime.setError(
      getErrorMessage(reason, "This PDF page could not be explained."),
    );
    return false;
  }
}

async function beginReviewInConnectedSession(
  runtime: RealtimeTutorRuntime,
  model: DocumentModel,
  review: ReviewCheckpoint,
  cancelTutorOutput: CancelTutorOutput,
) {
  try {
    cancelTutorOutput();
    await clearSelectionContext(runtime);
    await replacePageContext(runtime, model, review.pageIndex, "active");
    const segmentIndex = model.pages[
      review.pageIndex - 1
    ].chunks.findIndex((chunk) => chunk.id === review.chunk.id);

    if (segmentIndex < 0) {
      throw new Error("The saved review passage is unavailable.");
    }

    selectGuidedSegment(runtime, model, review.pageIndex, segmentIndex);
    startLearningCheckpoint(runtime, review, {
      phase: "review",
      attemptNumber: 1,
    });
    runtime.responseStateRef.current = supersedeRealtimeResponse(
      "learning_prompt",
    );
    const activePageContext =
      runtime.activePageContextItemRef.current;

    if (activePageContext?.pageIndex !== review.pageIndex) {
      runtime.responseStateRef.current = createRealtimeResponseState();
      throw new Error("The active PDF page context is unavailable.");
    }

    await sendEventAndWait(
      runtime,
      {
        type: "response.create",
        response: {
          input: [
            {
              type: "item_reference",
              id: activePageContext.itemId,
            },
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Begin the application-requested concept review identified in the response instructions. This is not a learner question.",
                },
              ],
            },
          ],
          instructions: buildReviewPromptInstructions(
            review,
            runtime.optionsRef.current.explanationStyle,
          ),
        },
      },
      "response.created",
    );
    runtime.setError("");
    return true;
  } catch (reason) {
    runtime.responseStateRef.current = createRealtimeResponseState();
    runtime.setIsTutorResponding(false);
    runtime.setError(
      getErrorMessage(reason, "This concept review could not start."),
    );
    return false;
  }
}

export async function continueGuided(
  runtime: RealtimeTutorRuntime,
  status: RealtimeTutorStatus,
  isSubmittingUserTurn: boolean,
  cancelTutorOutput: CancelTutorOutput,
) {
  const model = runtime.optionsRef.current.documentModel;
  const guidedSegment = runtime.guidedSegmentStateRef.current;

  if (
    status !== "connected" ||
    runtime.sessionModeRef.current !== "guided" ||
    !model ||
    !guidedSegment ||
    guidedSegment.segmentIndex === null ||
    runtime.activeLearningCheckpointRef.current
  ) {
    runtime.setError(
      runtime.activeLearningCheckpointRef.current
        ? "Answer the active learning question before continuing."
        : "Start the guided tutor before continuing.",
    );
    return false;
  }

  if (
    runtime.responseStateRef.current.logical ||
    runtime.responseStateRef.current.audio ||
    runtime.isUserTurnRef.current ||
    isSubmittingUserTurn
  ) {
    runtime.setError("Wait for the current tutor turn to finish.");
    return false;
  }

  const nextSegmentIndex = guidedSegment.complete
    ? guidedSegment.segmentIndex + 1
    : guidedSegment.segmentIndex;
  const page = model.pages[guidedSegment.pageIndex - 1];

  if (nextSegmentIndex >= page.chunks.length) {
    return false;
  }

  try {
    await explainGuidedSegment(
      runtime,
      model,
      guidedSegment.pageIndex,
      nextSegmentIndex,
      cancelTutorOutput,
    );
    runtime.setError("");
    return true;
  } catch (reason) {
    runtime.setIsTutorResponding(false);
    runtime.setError(
      getErrorMessage(
        reason,
        "The next part of this page could not be explained.",
      ),
    );
    return false;
  }
}

async function explainGuidedSegment(
  runtime: RealtimeTutorRuntime,
  model: DocumentModel,
  pageIndex: number,
  segmentIndex: number,
  cancelTutorOutput: CancelTutorOutput,
) {
  cancelTutorOutput();
  selectGuidedSegment(runtime, model, pageIndex, segmentIndex);
  const segment = model.pages[pageIndex - 1].chunks[segmentIndex];
  const surroundingContext = getGuidedSegmentContext(
    model,
    pageIndex,
    segmentIndex,
  );
  const checkpoint =
    runtime.guidedTutorModeRef.current === "learning"
      ? selectPrimaryCheckpoint(
          model,
          pageIndex,
          segment,
          runtime.checkpointedConceptIdsRef.current,
        )
      : null;

  if (checkpoint) {
    runtime.checkpointedConceptIdsRef.current.add(
      checkpoint.concept.id,
    );
    startLearningCheckpoint(
      runtime,
      checkpoint,
      { phase: "diagnostic", attemptNumber: 1 },
      surroundingContext,
    );
  } else {
    runtime.activeLearningCheckpointRef.current = null;
  }

  runtime.responseStateRef.current = supersedeRealtimeResponse(
    checkpoint ? "learning_prompt" : "guided_segment",
  );
  const activePageContext =
    runtime.activePageContextItemRef.current;

  if (activePageContext?.pageIndex !== pageIndex) {
    runtime.responseStateRef.current = createRealtimeResponseState();
    throw new Error("The active PDF page context is unavailable.");
  }

  try {
    await sendEventAndWait(
      runtime,
      {
        type: "response.create",
        response: {
          input: [
            {
              type: "item_reference",
              id: activePageContext.itemId,
            },
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: checkpoint
                    ? "Begin the application-requested diagnostic for the active guided segment. This is not a learner question."
                    : "Explain the active guided segment identified in the response instructions. This is an application-generated lesson step, not a learner question.",
                },
              ],
            },
          ],
          instructions: checkpoint
            ? buildDiagnosticPromptInstructions(
                checkpoint,
                runtime.optionsRef.current.explanationStyle,
              )
            : buildGuidedSegmentInstructions(
                model,
                pageIndex,
                segmentIndex,
                runtime.optionsRef.current.explanationStyle,
                surroundingContext,
              ),
        },
      },
      "response.created",
    );
  } catch (reason) {
    runtime.responseStateRef.current = createRealtimeResponseState();
    throw reason;
  }
}

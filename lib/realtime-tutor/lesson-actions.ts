import type { DocumentModel } from "@/lib/document-model";
import {
  createRealtimeResponseState,
  supersedeRealtimeResponse,
} from "@/lib/realtime-response-state";
import { sendEventAndWait } from "@/lib/realtime-tutor/event-transport";
import { buildTechnicalLessonActionInstructions } from "@/lib/realtime-tutor/instructions";
import { createLearnerRequestedLearningVisual } from "@/lib/realtime-tutor/learning-visual";
import type {
  PageContextItem,
  RealtimeTutorRuntime,
  RealtimeTutorStatus,
  TechnicalLessonAction,
} from "@/lib/realtime-tutor/types";
import { technicalLessonActionValues } from "@/lib/realtime-tutor/types";
import {
  getErrorMessage,
  isValidPageIndex,
} from "@/lib/realtime-tutor/transport";

export async function requestTechnicalLessonAction(
  runtime: RealtimeTutorRuntime,
  status: RealtimeTutorStatus,
  isSubmittingUserTurn: boolean,
  action: TechnicalLessonAction,
  pageIndex: number,
): Promise<boolean> {
  const lesson = getActiveGuidedLesson(
    runtime,
    status,
    isSubmittingUserTurn,
    action,
    pageIndex,
  );

  if (!lesson) {
    return false;
  }

  if (action === "visualize") {
    try {
      await createLearnerRequestedLearningVisual(
        runtime,
        pageIndex,
        lesson.chunk.id,
      );
      return true;
    } catch {
      return false;
    }
  }

  runtime.responseStateRef.current = supersedeRealtimeResponse(
    "technical_lesson_action",
  );

  try {
    await sendEventAndWait(
      runtime,
      {
        type: "response.create",
        response: {
          input: [
            {
              type: "item_reference",
              id: lesson.pageContext.itemId,
            },
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Apply the learner-requested ${action} teaching action to the active guided lesson. This is an application-generated lesson action, not a new learner question.`,
                },
              ],
            },
          ],
          instructions: buildTechnicalLessonActionInstructions(
            lesson.model,
            pageIndex,
            lesson.segmentIndex,
            action,
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
      getErrorMessage(
        reason,
        "The technical lesson action could not start.",
      ),
    );
    return false;
  }
}

type ActiveGuidedLesson = {
  model: DocumentModel;
  pageContext: PageContextItem;
  segmentIndex: number;
  chunk: DocumentModel["pages"][number]["chunks"][number];
};

function getActiveGuidedLesson(
  runtime: RealtimeTutorRuntime,
  status: RealtimeTutorStatus,
  isSubmittingUserTurn: boolean,
  action: TechnicalLessonAction,
  pageIndex: number,
): ActiveGuidedLesson | null {
  if (
    !technicalLessonActionValues.includes(action) ||
    status !== "connected" ||
    runtime.dataChannelRef.current?.readyState !== "open" ||
    runtime.sessionModeRef.current !== "guided" ||
    isSubmittingUserTurn ||
    runtime.userTurnTransitionRef.current ||
    runtime.isUserTurnRef.current ||
    !isTutorIdle(runtime)
  ) {
    return null;
  }

  const { documentModel } = runtime.optionsRef.current;
  const guidedSegment = runtime.guidedSegmentStateRef.current;
  const pageContext = runtime.activePageContextItemRef.current;

  if (
    !documentModel ||
    !guidedSegment ||
    guidedSegment.segmentIndex === null ||
    guidedSegment.pageIndex !== pageIndex ||
    !isValidPageIndex(documentModel, pageIndex) ||
    pageContext?.pageIndex !== pageIndex
  ) {
    return null;
  }

  const chunk = documentModel.pages[pageIndex - 1].chunks[
    guidedSegment.segmentIndex
  ];

  if (!chunk) {
    return null;
  }

  return {
    model: documentModel,
    pageContext,
    segmentIndex: guidedSegment.segmentIndex,
    chunk,
  };
}

function isTutorIdle(runtime: RealtimeTutorRuntime) {
  const responseState = runtime.responseStateRef.current;

  return (
    !responseState.pending &&
    !responseState.continuation &&
    !responseState.logical &&
    !responseState.audio
  );
}

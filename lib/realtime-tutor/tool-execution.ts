import { executeRealtimeTutorTool } from "@/lib/realtime-tutor/tools";
import { replacePageContext } from "@/lib/realtime-tutor/context";
import { sendEventAndWait } from "@/lib/realtime-tutor/event-transport";
import { recordLearningAttempt } from "@/lib/realtime-tutor/progression";
import type {
  RealtimeFunctionCall,
  RealtimeTutorRuntime,
} from "@/lib/realtime-tutor/types";
import { getErrorMessage } from "@/lib/realtime-tutor/transport";

export async function sendToolOutputs(
  runtime: RealtimeTutorRuntime,
  functionCalls: RealtimeFunctionCall[],
) {
  const {
    documentModel,
    selection,
    textSelectionContext,
  } = runtime.optionsRef.current;

  for (const functionCall of functionCalls) {
    let output: unknown;

    try {
      if (!documentModel) {
        throw new Error("The active document is unavailable.");
      }

      const learningCheckpoint =
        runtime.activeLearningCheckpointRef.current;

      output = await executeRealtimeTutorTool(
        functionCall.name,
        functionCall.arguments,
        {
          documentModel,
          selection,
          textSelectionContext,
          attachPageContext: (pageIndex) =>
            replacePageContext(
              runtime,
              documentModel,
              pageIndex,
              "auxiliary",
            ),
          activeLearningAttempt: learningCheckpoint
            ? {
                phase: learningCheckpoint.state.phase,
                attemptNumber: learningCheckpoint.state.attemptNumber,
                chunkId: learningCheckpoint.selection.chunk.id,
                conceptId: learningCheckpoint.selection.concept.id,
              }
            : null,
          recordLearningAttempt: (attempt) =>
            recordLearningAttempt(runtime, attempt),
        },
      );
    } catch (reason) {
      output = {
        error: getErrorMessage(
          reason,
          "The document context tool could not run.",
        ),
      };
    }

    await sendEventAndWait(
      runtime,
      {
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCall.call_id,
          output: JSON.stringify(output),
        },
      },
      "conversation.item.added",
    );
  }
}

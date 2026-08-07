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
          findDocumentTopics: (query) =>
            searchDocumentTopics(
              runtime.optionsRef.current.documentId!,
              query,
            ),
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

async function searchDocumentTopics(
  documentId: string,
  query: string,
) {
  const response = await fetch(
    `/api/tutorials/${documentId}/topics`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const result = (await response.json()) as {
    matches?: Array<{
      page_index: number;
      page_label: string;
      title: string;
      summary: string;
      concepts: string[];
    }>;
    message?: string;
  };

  if (!response.ok || !result.matches) {
    throw new Error(
      result.message ??
        "Document topic search is temporarily unavailable.",
    );
  }

  return result.matches;
}

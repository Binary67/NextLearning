import type {
  DocumentModel,
  TextSelectionContext,
} from "@/lib/document-model";
import type { DocumentTopicMatch } from "@/lib/document-embeddings";
import type { DocumentSelection } from "@/lib/document-selection";
import {
  FIND_DOCUMENT_TOPICS_TOOL_NAME,
  findDocumentTopics,
  findDocumentTopicsTool,
} from "@/lib/realtime-tutor/tools/find-document-topics";
import {
  GET_SELECTION_GROUNDING_TOOL_NAME,
  getSelectionGrounding,
  getSelectionGroundingTool,
} from "@/lib/realtime-tutor/tools/get-selection-grounding";
import {
  GET_PAGE_CONTEXT_TOOL_NAME,
  getPageContext,
  getPageContextTool,
} from "@/lib/realtime-tutor/tools/get-page-context";
import {
  type ActiveLearningAttempt,
  readLearningAttempt,
  RECORD_LEARNING_ATTEMPT_TOOL_NAME,
  recordLearningAttemptTool,
  type ValidatedLearningAttempt,
} from "@/lib/realtime-tutor/tools/record-learning-attempt";

type RealtimeTutorToolContext = {
  documentModel: DocumentModel;
  selection: DocumentSelection | null;
  textSelectionContext: TextSelectionContext | null;
  attachPageContext: (pageIndex: number) => Promise<unknown>;
  activeLearningAttempt: ActiveLearningAttempt | null;
  recordLearningAttempt: (
    attempt: ValidatedLearningAttempt,
  ) => Promise<unknown>;
  findDocumentTopics: (
    query: string,
  ) => Promise<DocumentTopicMatch[]>;
};

export const realtimeTutorTools = [
  getSelectionGroundingTool,
  findDocumentTopicsTool,
  getPageContextTool,
];

export const learningRealtimeTutorTools = [
  ...realtimeTutorTools,
  recordLearningAttemptTool,
];

export async function executeRealtimeTutorTool(
  name: string,
  argumentsJson: string,
  context: RealtimeTutorToolContext,
) {
  switch (name) {
    case GET_SELECTION_GROUNDING_TOOL_NAME: {
      if (!context.selection) {
        throw new Error("The learner has no active PDF selection.");
      }

      return getSelectionGrounding(
        context.documentModel,
        context.selection,
        context.textSelectionContext,
      );
    }
    case FIND_DOCUMENT_TOPICS_TOOL_NAME:
      return findDocumentTopics(
        argumentsJson,
        context.findDocumentTopics,
      );
    case GET_PAGE_CONTEXT_TOOL_NAME:
      return getPageContext(
        context.documentModel,
        argumentsJson,
        context.attachPageContext,
      );
    case RECORD_LEARNING_ATTEMPT_TOOL_NAME:
      if (!context.activeLearningAttempt) {
        throw new Error("There is no active learning attempt to record.");
      }

      return context.recordLearningAttempt(
        readLearningAttempt(
          argumentsJson,
          context.activeLearningAttempt,
        ),
      );
    default:
      throw new Error(`The Realtime tutor requested an unknown tool: ${name}.`);
  }
}

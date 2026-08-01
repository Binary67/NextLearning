import type {
  DocumentModel,
  TextSelectionContext,
} from "@/lib/document-model";
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

type RealtimeTutorToolContext = {
  documentModel: DocumentModel;
  selection: DocumentSelection;
  textSelectionContext: TextSelectionContext | null;
};

export const realtimeTutorTools = [
  getSelectionGroundingTool,
  findDocumentTopicsTool,
];

export function executeRealtimeTutorTool(
  name: string,
  argumentsJson: string,
  context: RealtimeTutorToolContext,
) {
  switch (name) {
    case GET_SELECTION_GROUNDING_TOOL_NAME:
      return getSelectionGrounding(
        context.documentModel,
        context.selection,
        context.textSelectionContext,
      );
    case FIND_DOCUMENT_TOPICS_TOOL_NAME:
      return findDocumentTopics(context.documentModel, argumentsJson);
    default:
      throw new Error(`The Realtime tutor requested an unknown tool: ${name}.`);
  }
}

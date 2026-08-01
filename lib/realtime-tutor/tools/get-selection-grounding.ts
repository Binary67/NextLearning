import {
  buildSelectionGrounding,
  type DocumentModel,
  type TextSelectionContext,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";

export const GET_SELECTION_GROUNDING_TOOL_NAME =
  "get_selection_grounding";

export const getSelectionGroundingTool = {
  type: "function",
  name: GET_SELECTION_GROUNDING_TOOL_NAME,
  description:
    "Return the authoritative prepared concepts, connections, and related pages for the learner's active PDF selection. Use this when the selection alone is not enough to explain prerequisites or document relationships.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
} as const;

export function getSelectionGrounding(
  model: DocumentModel,
  selection: DocumentSelection,
  textSelection: TextSelectionContext | null,
) {
  return buildSelectionGrounding(
    model,
    selection.page_index,
    textSelection,
  );
}

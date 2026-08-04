import type { DocumentModel } from "@/lib/document-model";

export const GET_PAGE_CONTEXT_TOOL_NAME = "get_page_context";

export const getPageContextTool = {
  type: "function",
  name: GET_PAGE_CONTEXT_TOOL_NAME,
  description:
    "Attach the rendered image and prepared metadata for one specific PDF page. Use this only when that other page is materially needed to answer the learner. Do not use it to explore the document or reveal future pages.",
  parameters: {
    type: "object",
    properties: {
      page_index: {
        type: "integer",
        description: "The 1-based PDF page index to retrieve.",
      },
    },
    required: ["page_index"],
    additionalProperties: false,
  },
} as const;

export async function getPageContext(
  model: DocumentModel,
  argumentsJson: string,
  attachPageContext: (pageIndex: number) => Promise<unknown>,
) {
  const pageIndex = readPageIndex(argumentsJson);

  if (pageIndex < 1 || pageIndex > model.page_count) {
    throw new Error(
      `PDF page ${pageIndex} is not available. Choose a page from 1 through ${model.page_count}.`,
    );
  }

  return attachPageContext(pageIndex);
}

function readPageIndex(argumentsJson: string) {
  let value: unknown;

  try {
    value = JSON.parse(argumentsJson) as unknown;
  } catch {
    throw new Error("A valid PDF page index is required.");
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("page_index" in value) ||
    typeof value.page_index !== "number" ||
    !Number.isInteger(value.page_index)
  ) {
    throw new Error("A valid integer PDF page index is required.");
  }

  return value.page_index;
}

import type { DocumentTopicMatch } from "@/lib/document-embeddings";

export const FIND_DOCUMENT_TOPICS_TOOL_NAME = "find_document_topics";

export const findDocumentTopicsTool = {
  type: "function",
  name: FIND_DOCUMENT_TOPICS_TOOL_NAME,
  description:
    "Search the prepared document topic titles, summaries, and concepts. Use this for questions about material beyond the active selection. Results are summaries, not exact quotations from the PDF.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A concise topic or concept to find in the prepared document.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
} as const;

export async function findDocumentTopics(
  argumentsJson: string,
  search: (query: string) => Promise<DocumentTopicMatch[]>,
) {
  const query = readQuery(argumentsJson);
  return { matches: await search(query) };
}

function readQuery(argumentsJson: string) {
  const value = JSON.parse(argumentsJson) as unknown;

  if (
    typeof value !== "object" ||
    value === null ||
    !("query" in value) ||
    typeof value.query !== "string" ||
    !value.query.trim()
  ) {
    throw new Error("A document topic query is required.");
  }

  return value.query;
}

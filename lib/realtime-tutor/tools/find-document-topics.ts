import type { DocumentModel } from "@/lib/document-model";

export const FIND_DOCUMENT_TOPICS_TOOL_NAME = "find_document_topics";

const MAXIMUM_TOPIC_MATCHES = 5;
const STOP_WORDS = new Set([
  "about",
  "and",
  "are",
  "does",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "the",
  "this",
  "to",
  "was",
  "what",
  "where",
  "with",
]);

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

export function findDocumentTopics(
  model: DocumentModel,
  argumentsJson: string,
) {
  const query = readQuery(argumentsJson);
  const queryTokens = tokenize(query);
  const conceptsById = new Map(
    model.concepts.map((concept) => [concept.id, concept]),
  );
  const matches = model.pages
    .flatMap((page) =>
      page.chunks.map((chunk) => {
        const concepts = chunk.concept_ids.flatMap((conceptId) => {
          const concept = conceptsById.get(conceptId);
          return concept ? [concept] : [];
        });
        const score = scoreTopicMatch(
          queryTokens,
          chunk.title,
          chunk.summary,
          concepts.flatMap((concept) => [
            concept.name,
            concept.definition,
          ]),
        );

        return {
          page_index: page.page_index,
          page_label: page.page_label,
          title: chunk.title,
          summary: chunk.summary,
          concepts: concepts.map((concept) => concept.name),
          score,
        };
      }),
    )
    .filter((match) => match.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.page_index - right.page_index ||
        left.title.localeCompare(right.title),
    )
    .slice(0, MAXIMUM_TOPIC_MATCHES)
    .map((match) => ({
      page_index: match.page_index,
      page_label: match.page_label,
      title: match.title,
      summary: match.summary,
      concepts: match.concepts,
    }));

  return { matches };
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

function scoreTopicMatch(
  queryTokens: ReadonlySet<string>,
  title: string,
  summary: string,
  conceptText: string[],
) {
  const titleTokens = tokenize(title);
  const summaryTokens = tokenize(summary);
  const conceptTokens = tokenize(conceptText.join(" "));
  let score = 0;

  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      score += 3;
    } else if (conceptTokens.has(token)) {
      score += 2;
    } else if (summaryTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function tokenize(value: string) {
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  return new Set(
    words.filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

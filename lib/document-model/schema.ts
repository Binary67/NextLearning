import {
  DOCUMENT_MODEL_SCHEMA_VERSION,
  explicitnessValues,
  occurrenceRoles,
  relationshipValues,
} from "@/lib/document-model/types";

const documentChunkJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    section_title: { type: "string" },
    sources: {
      type: "array",
      description:
        "One to four ordered source spans from the owning page and, only for a continuation, its immediately previous page.",
      items: {
        type: "object",
        properties: {
          page_index: { type: "integer" },
          source_text: {
            type: "string",
            description:
              "An exact non-empty PDF passage of at most 8000 characters.",
          },
        },
        required: ["page_index", "source_text"],
        additionalProperties: false,
      },
    },
    title: { type: "string" },
    summary: {
      type: "string",
      description:
        "A non-empty grounded summary of at most 1600 characters.",
    },
    concept_ids: {
      type: "array",
      description: "One to twelve unique concept IDs.",
      items: { type: "string" },
    },
  },
  required: [
    "id",
    "section_title",
    "sources",
    "title",
    "summary",
    "concept_ids",
  ],
  additionalProperties: false,
} as const;

export const documentModelJsonSchema = {
  type: "object",
  properties: {
    schema_version: {
      type: "integer",
      enum: [DOCUMENT_MODEL_SCHEMA_VERSION],
    },
    document_id: { type: "string" },
    title: { type: "string" },
    page_count: { type: "integer" },
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page_index: { type: "integer" },
          page_label: { type: "string" },
          chunks: {
            type: "array",
            description:
              "At most three coherent page lessons in reading order.",
            items: documentChunkJsonSchema,
          },
        },
        required: ["page_index", "page_label", "chunks"],
        additionalProperties: false,
      },
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          definition: { type: "string" },
          occurrences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                page_index: { type: "integer" },
                page_label: { type: "string" },
                role: { type: "string", enum: occurrenceRoles },
                explicitness: {
                  type: "string",
                  enum: explicitnessValues,
                },
                confidence: { type: "number" },
              },
              required: [
                "page_index",
                "page_label",
                "role",
                "explicitness",
                "confidence",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "name", "definition", "occurrences"],
        additionalProperties: false,
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          relationship: {
            type: "string",
            enum: relationshipValues,
          },
          relevant_pages: {
            type: "array",
            items: { type: "integer" },
          },
          reason: { type: "string" },
          confidence: { type: "number" },
        },
        required: [
          "from",
          "to",
          "relationship",
          "relevant_pages",
          "reason",
          "confidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "schema_version",
    "document_id",
    "title",
    "page_count",
    "pages",
    "concepts",
    "connections",
  ],
  additionalProperties: false,
} as const;

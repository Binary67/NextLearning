export const DOCUMENT_MODEL_SCHEMA_VERSION = 1;

const occurrenceRoles = [
  "introduced",
  "defined",
  "explained",
  "illustrated",
  "applied",
  "assessed",
  "referenced",
] as const;

const explicitnessValues = ["explicit", "implicit"] as const;

const relationshipValues = [
  "prerequisite_for",
  "has_subcategory",
  "part_of",
  "uses",
  "supports",
  "enables",
  "causes",
  "contrasts_with",
  "applies",
  "related_to",
] as const;

export type OccurrenceRole = (typeof occurrenceRoles)[number];
export type Explicitness = (typeof explicitnessValues)[number];
export type ConceptRelationship = (typeof relationshipValues)[number];

export type ConceptOccurrence = {
  page_index: number;
  page_label: string;
  role: OccurrenceRole;
  explicitness: Explicitness;
  confidence: number;
};

export type DocumentConcept = {
  id: string;
  name: string;
  definition: string;
  occurrences: ConceptOccurrence[];
};

export type DocumentConnection = {
  from: string;
  to: string;
  relationship: ConceptRelationship;
  relevant_pages: number[];
  teaching_reason: string;
  confidence: number;
};

export type DocumentModel = {
  schema_version: number;
  document_id: string;
  title: string;
  page_count: number;
  concepts: DocumentConcept[];
  connections: DocumentConnection[];
};

export type DocumentMapSummary = {
  title: string;
  page_count: number;
  concept_count: number;
  connection_count: number;
};

export type PageLearningContext = {
  current_page: {
    page_index: number;
    page_label: string;
  };
  current_concepts: Array<{
    concept_id: string;
    name: string;
    role: OccurrenceRole;
    explicitness: Explicitness;
  }>;
  future_connections: Array<{
    from_concept_id: string;
    to_concept_id: string;
    name: string;
    page_index: number;
    page_label: string;
    relationship: ConceptRelationship | "continued_on";
    reason: string;
    disclosure: "mention_if_helpful" | "explain_if_asked";
  }>;
};

type FutureConnectionCandidate =
  PageLearningContext["future_connections"][number] & {
    confidence: number;
  };

export const documentModelJsonSchema = {
  type: "object",
  properties: {
    schema_version: {
      type: "integer",
      enum: [DOCUMENT_MODEL_SCHEMA_VERSION],
    },
    document_id: { type: "string" },
    title: { type: "string" },
    page_count: { type: "integer", minimum: 1 },
    concepts: {
      type: "array",
      maxItems: 120,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            pattern: "^concept:[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          name: { type: "string" },
          definition: { type: "string" },
          occurrences: {
            type: "array",
            minItems: 1,
            maxItems: 40,
            items: {
              type: "object",
              properties: {
                page_index: { type: "integer", minimum: 1 },
                page_label: { type: "string" },
                role: { type: "string", enum: occurrenceRoles },
                explicitness: {
                  type: "string",
                  enum: explicitnessValues,
                },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                },
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
      maxItems: 400,
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
            minItems: 1,
            maxItems: 20,
            items: { type: "integer", minimum: 1 },
          },
          teaching_reason: { type: "string" },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
        required: [
          "from",
          "to",
          "relationship",
          "relevant_pages",
          "teaching_reason",
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
    "concepts",
    "connections",
  ],
  additionalProperties: false,
} as const;

export function summarizeDocumentModel(
  model: DocumentModel,
): DocumentMapSummary {
  return {
    title: model.title,
    page_count: model.page_count,
    concept_count: model.concepts.length,
    connection_count: model.connections.length,
  };
}

export function buildPageLearningContext(
  model: DocumentModel,
  pageIndex: number,
): PageLearningContext {
  const currentOccurrences = model.concepts.flatMap((concept) =>
    concept.occurrences
      .filter((occurrence) => occurrence.page_index === pageIndex)
      .map((occurrence) => ({ concept, occurrence })),
  );
  const currentConceptIds = new Set(
    currentOccurrences.map(({ concept }) => concept.id),
  );
  const candidates: FutureConnectionCandidate[] = [];

  for (const { concept, occurrence } of currentOccurrences) {
    const continuation = findNextOccurrence(concept, pageIndex);

    if (continuation) {
      candidates.push({
        from_concept_id: concept.id,
        to_concept_id: concept.id,
        name: concept.name,
        page_index: continuation.page_index,
        page_label: continuation.page_label,
        relationship: "continued_on",
        reason: `${concept.name} is ${continuation.role} later in the document.`,
        disclosure:
          occurrence.explicitness === "implicit"
            ? "explain_if_asked"
            : "mention_if_helpful",
        confidence: continuation.confidence,
      });
    }

    for (const connection of model.connections) {
      if (connection.from !== concept.id) {
        continue;
      }

      const target = model.concepts.find(
        (item) => item.id === connection.to,
      );
      const targetOccurrence = target
        ? findNextOccurrence(target, pageIndex)
        : undefined;

      if (!target || !targetOccurrence || currentConceptIds.has(target.id)) {
        continue;
      }

      candidates.push({
        from_concept_id: concept.id,
        to_concept_id: target.id,
        name: target.name,
        page_index: targetOccurrence.page_index,
        page_label: targetOccurrence.page_label,
        relationship: connection.relationship,
        reason: connection.teaching_reason,
        disclosure: "mention_if_helpful",
        confidence: Math.min(
          connection.confidence,
          targetOccurrence.confidence,
        ),
      });
    }
  }

  const futureConnections = Array.from(
    new Map(
      candidates
        .sort(
          (left, right) =>
            left.page_index - right.page_index ||
            right.confidence - left.confidence,
        )
        .map((candidate) => [
          `${candidate.to_concept_id}:${candidate.page_index}`,
          candidate,
        ]),
    ).values(),
  )
    .slice(0, 5)
    .map((candidate) => ({
      from_concept_id: candidate.from_concept_id,
      to_concept_id: candidate.to_concept_id,
      name: candidate.name,
      page_index: candidate.page_index,
      page_label: candidate.page_label,
      relationship: candidate.relationship,
      reason: candidate.reason,
      disclosure: candidate.disclosure,
    }));

  return {
    current_page: {
      page_index: pageIndex,
      page_label:
        currentOccurrences[0]?.occurrence.page_label ?? String(pageIndex),
    },
    current_concepts: currentOccurrences.map(({ concept, occurrence }) => ({
      concept_id: concept.id,
      name: concept.name,
      role: occurrence.role,
      explicitness: occurrence.explicitness,
    })),
    future_connections: futureConnections,
  };
}

export function validateDocumentModel(
  value: unknown,
  documentId: string,
): DocumentModel {
  if (!isRecord(value)) {
    throw new Error("The generated document map is not an object.");
  }

  if (
    value.schema_version !== DOCUMENT_MODEL_SCHEMA_VERSION ||
    value.document_id !== documentId ||
    typeof value.title !== "string" ||
    !isPositiveInteger(value.page_count) ||
    !Array.isArray(value.concepts) ||
    !Array.isArray(value.connections)
  ) {
    throw new Error("The generated document map has invalid metadata.");
  }

  const pageCount = value.page_count;
  const concepts = value.concepts;
  const conceptIds = new Set<string>();

  for (const concept of concepts) {
    if (
      !isRecord(concept) ||
      typeof concept.id !== "string" ||
      typeof concept.name !== "string" ||
      typeof concept.definition !== "string" ||
      !Array.isArray(concept.occurrences) ||
      concept.occurrences.length === 0 ||
      conceptIds.has(concept.id)
    ) {
      throw new Error("The generated document map has an invalid concept.");
    }

    conceptIds.add(concept.id);

    for (const occurrence of concept.occurrences) {
      if (
        !isRecord(occurrence) ||
        !isPositiveInteger(occurrence.page_index) ||
        occurrence.page_index > pageCount ||
        typeof occurrence.page_label !== "string" ||
        !occurrenceRoles.includes(occurrence.role as OccurrenceRole) ||
        !explicitnessValues.includes(
          occurrence.explicitness as Explicitness,
        ) ||
        !isConfidence(occurrence.confidence)
      ) {
        throw new Error(
          "The generated document map has an invalid occurrence.",
        );
      }
    }
  }

  for (const connection of value.connections) {
    if (
      !isRecord(connection) ||
      typeof connection.from !== "string" ||
      typeof connection.to !== "string" ||
      !conceptIds.has(connection.from) ||
      !conceptIds.has(connection.to) ||
      !relationshipValues.includes(
        connection.relationship as ConceptRelationship,
      ) ||
      !Array.isArray(connection.relevant_pages) ||
      connection.relevant_pages.length === 0 ||
      !connection.relevant_pages.every(
        (page) => isPositiveInteger(page) && page <= pageCount,
      ) ||
      typeof connection.teaching_reason !== "string" ||
      !isConfidence(connection.confidence)
    ) {
      throw new Error("The generated document map has an invalid connection.");
    }
  }

  return value as DocumentModel;
}

function findNextOccurrence(
  concept: DocumentConcept,
  pageIndex: number,
) {
  return concept.occurrences
    .filter((occurrence) => occurrence.page_index > pageIndex)
    .sort((left, right) => left.page_index - right.page_index)[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0
  );
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

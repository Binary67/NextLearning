export const DOCUMENT_MODEL_SCHEMA_VERSION = 2;

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

export type DocumentChunk = {
  id: string;
  title: string;
  summary: string;
  concept_ids: string[];
};

export type DocumentPage = {
  page_index: number;
  page_label: string;
  chunks: DocumentChunk[];
};

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
  reason: string;
  confidence: number;
};

export type DocumentModel = {
  schema_version: number;
  document_id: string;
  title: string;
  page_count: number;
  pages: DocumentPage[];
  concepts: DocumentConcept[];
  connections: DocumentConnection[];
};

export type DocumentMapSummary = {
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
  related_pages: Array<{
    page_index: number;
    page_label: string;
    concept_name: string;
    reason: string;
  }>;
};

export type SelectionGrounding = {
  current_page: {
    page_index: number;
    page_label: string;
  };
  current_chunks: DocumentChunk[];
  current_concepts: Array<{
    id: string;
    name: string;
    definition: string;
    role: OccurrenceRole;
  }>;
  connections: Array<{
    from: string;
    to: string;
    relationship: ConceptRelationship;
    relevant_pages: number[];
    reason: string;
  }>;
  related_chunks: Array<DocumentChunk & {
    page_index: number;
    page_label: string;
  }>;
};

const documentChunkJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    concept_ids: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["id", "title", "summary", "concept_ids"],
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

export function summarizeDocumentModel(
  model: DocumentModel,
): DocumentMapSummary {
  return {
    page_count: model.page_count,
    concept_count: model.concepts.length,
    connection_count: model.connections.length,
  };
}

export function buildPageLearningContext(
  model: DocumentModel,
  pageIndex: number,
): PageLearningContext {
  const page = model.pages[pageIndex - 1];
  const currentOccurrences = getPageConceptOccurrences(model, pageIndex);
  const currentConceptIds = new Set(
    currentOccurrences.map(({ concept }) => concept.id),
  );
  const relatedPages = new Map<
    number,
    PageLearningContext["related_pages"][number]
  >();

  for (const connection of model.connections) {
    if (
      !currentConceptIds.has(connection.from) &&
      !currentConceptIds.has(connection.to)
    ) {
      continue;
    }

    const relatedConceptId = currentConceptIds.has(connection.from)
      ? connection.to
      : connection.from;
    const relatedConcept = model.concepts.find(
      (concept) => concept.id === relatedConceptId,
    );

    if (!relatedConcept) {
      continue;
    }

    for (const relatedPageIndex of connection.relevant_pages) {
      if (relatedPageIndex === pageIndex || relatedPages.has(relatedPageIndex)) {
        continue;
      }

      relatedPages.set(relatedPageIndex, {
        page_index: relatedPageIndex,
        page_label:
          model.pages[relatedPageIndex - 1]?.page_label ??
          String(relatedPageIndex),
        concept_name: relatedConcept.name,
        reason: connection.reason,
      });
    }
  }

  return {
    current_page: {
      page_index: pageIndex,
      page_label: page?.page_label ?? String(pageIndex),
    },
    current_concepts: currentOccurrences.map(({ concept, occurrence }) => ({
      concept_id: concept.id,
      name: concept.name,
      role: occurrence.role,
      explicitness: occurrence.explicitness,
    })),
    related_pages: [...relatedPages.values()].slice(0, 5),
  };
}

export function buildSelectionGrounding(
  model: DocumentModel,
  pageIndex: number,
): SelectionGrounding {
  const page = model.pages[pageIndex - 1];
  const currentOccurrences = getPageConceptOccurrences(model, pageIndex);
  const currentConceptIds = new Set(
    currentOccurrences.map(({ concept }) => concept.id),
  );
  const connections = model.connections
    .filter(
      (connection) =>
        currentConceptIds.has(connection.from) ||
        currentConceptIds.has(connection.to),
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 12);
  const relatedConceptIds = new Set(
    connections.flatMap((connection) => [connection.from, connection.to]),
  );
  const relatedPageIndexes = new Set(
    connections.flatMap((connection) => connection.relevant_pages),
  );
  relatedPageIndexes.delete(pageIndex);

  const relatedChunks = model.pages
    .filter((item) => relatedPageIndexes.has(item.page_index))
    .flatMap((item) =>
      item.chunks
        .filter((chunk) =>
          chunk.concept_ids.some((conceptId) =>
            relatedConceptIds.has(conceptId),
          ),
        )
        .map((chunk) => ({
          ...chunk,
          page_index: item.page_index,
          page_label: item.page_label,
        })),
    )
    .slice(0, 8);
  const conceptNamesById = new Map(
    model.concepts.map((concept) => [concept.id, concept.name]),
  );

  return {
    current_page: {
      page_index: pageIndex,
      page_label: page?.page_label ?? String(pageIndex),
    },
    current_chunks: page?.chunks ?? [],
    current_concepts: currentOccurrences.map(({ concept, occurrence }) => ({
      id: concept.id,
      name: concept.name,
      definition: concept.definition,
      role: occurrence.role,
    })),
    connections: connections.map((connection) => ({
      from: conceptNamesById.get(connection.from) ?? connection.from,
      to: conceptNamesById.get(connection.to) ?? connection.to,
      relationship: connection.relationship,
      relevant_pages: connection.relevant_pages,
      reason: connection.reason,
    })),
    related_chunks: relatedChunks,
  };
}

export function validateDocumentModel(
  value: unknown,
  documentId: string,
): DocumentModel {
  if (!isRecord(value)) {
    throw new Error("The generated document model is not an object.");
  }

  if (
    value.schema_version !== DOCUMENT_MODEL_SCHEMA_VERSION ||
    value.document_id !== documentId ||
    !isNonEmptyString(value.title) ||
    !isPositiveInteger(value.page_count) ||
    !Array.isArray(value.pages) ||
    value.pages.length !== value.page_count ||
    !Array.isArray(value.concepts) ||
    value.concepts.length === 0 ||
    value.concepts.length > 120 ||
    !Array.isArray(value.connections) ||
    value.connections.length > 400
  ) {
    throw new Error("The generated document model has invalid metadata.");
  }

  const pageLabels = validatePages(value.pages);
  const conceptIds = validateConcepts(
    value.concepts,
    value.page_count,
    pageLabels,
  );
  validatePageChunks(value.pages, conceptIds, value.concepts);
  validateConnections(value.connections, conceptIds, value.page_count);

  return value as DocumentModel;
}

function validatePages(pages: unknown[]) {
  const pageLabels = new Map<number, string>();
  const chunkIds = new Set<string>();
  let chunkCount = 0;

  for (const [index, page] of pages.entries()) {
    if (
      !isRecord(page) ||
      page.page_index !== index + 1 ||
      !isNonEmptyString(page.page_label) ||
      !Array.isArray(page.chunks) ||
      page.chunks.length > 20
    ) {
      throw new Error("The generated document model has an invalid page.");
    }

    pageLabels.set(page.page_index, page.page_label);

    for (const chunk of page.chunks) {
      if (
        !isRecord(chunk) ||
        !isChunkId(chunk.id) ||
        chunkIds.has(chunk.id) ||
        !isNonEmptyString(chunk.title) ||
        !isSourceSummary(chunk.summary) ||
        !isStringArray(chunk.concept_ids, 1, 12)
      ) {
        throw new Error(
          "The generated document model has an invalid page chunk.",
        );
      }

      chunkIds.add(chunk.id);
      chunkCount += 1;
    }
  }

  if (chunkCount === 0 || chunkCount > 400) {
    throw new Error("The generated document model has invalid page chunks.");
  }

  return pageLabels;
}

function validateConcepts(
  concepts: unknown[],
  pageCount: number,
  pageLabels: ReadonlyMap<number, string>,
) {
  const conceptIds = new Set<string>();

  for (const concept of concepts) {
    if (
      !isRecord(concept) ||
      !isConceptId(concept.id) ||
      conceptIds.has(concept.id) ||
      !isNonEmptyString(concept.name) ||
      !isNonEmptyString(concept.definition) ||
      !Array.isArray(concept.occurrences) ||
      concept.occurrences.length === 0 ||
      concept.occurrences.length > 40
    ) {
      throw new Error("The generated document model has an invalid concept.");
    }

    conceptIds.add(concept.id);
    const occurrencePages = new Set<number>();

    for (const occurrence of concept.occurrences) {
      if (
        !isRecord(occurrence) ||
        !isPositiveInteger(occurrence.page_index) ||
        occurrence.page_index > pageCount ||
        occurrence.page_label !== pageLabels.get(occurrence.page_index) ||
        !occurrenceRoles.includes(occurrence.role as OccurrenceRole) ||
        !explicitnessValues.includes(
          occurrence.explicitness as Explicitness,
        ) ||
        !isConfidence(occurrence.confidence) ||
        occurrencePages.has(occurrence.page_index)
      ) {
        throw new Error(
          "The generated document model has an invalid occurrence.",
        );
      }

      occurrencePages.add(occurrence.page_index);
    }
  }

  return conceptIds;
}

function validatePageChunks(
  pages: unknown[],
  conceptIds: ReadonlySet<string>,
  concepts: unknown[],
) {
  const occurrencePagesByConceptId = new Map<string, Set<number>>();

  for (const concept of concepts) {
    if (!isRecord(concept) || !Array.isArray(concept.occurrences)) {
      continue;
    }

    occurrencePagesByConceptId.set(
      concept.id as string,
      new Set(
        concept.occurrences
          .filter(isRecord)
          .map((occurrence) => occurrence.page_index as number),
      ),
    );
  }

  for (const page of pages) {
    if (!isRecord(page) || !Array.isArray(page.chunks)) {
      continue;
    }

    for (const chunk of page.chunks) {
      if (!isRecord(chunk) || !Array.isArray(chunk.concept_ids)) {
        continue;
      }

      const isGrounded = chunk.concept_ids.every(
        (conceptId) =>
          typeof conceptId === "string" &&
          conceptIds.has(conceptId) &&
          occurrencePagesByConceptId
            .get(conceptId)
            ?.has(page.page_index as number),
      );

      if (!isGrounded) {
        throw new Error(
          "The generated document model has an ungrounded page chunk.",
        );
      }
    }
  }
}

function validateConnections(
  connections: unknown[],
  conceptIds: ReadonlySet<string>,
  pageCount: number,
) {
  for (const connection of connections) {
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
      connection.relevant_pages.length > 20 ||
      !connection.relevant_pages.every(
        (page) => isPositiveInteger(page) && page <= pageCount,
      ) ||
      !isNonEmptyString(connection.reason) ||
      !isConfidence(connection.confidence)
    ) {
      throw new Error(
        "The generated document model has an invalid connection.",
      );
    }
  }
}

function getPageConceptOccurrences(
  model: DocumentModel,
  pageIndex: number,
) {
  return model.concepts.flatMap((concept) =>
    concept.occurrences
      .filter((occurrence) => occurrence.page_index === pageIndex)
      .map((occurrence) => ({ concept, occurrence })),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0
  );
}

function isConceptId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^concept:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isChunkId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^chunk:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isStringArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function isSourceSummary(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= 1600;
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

import type { SelectionBounds } from "@/lib/document-selection";
import {
  DOCUMENT_MODEL_SCHEMA_VERSION,
  type ConceptRelationship,
  type DocumentModel,
  type Explicitness,
  type GeneratedDocumentModel,
  type OccurrenceRole,
  explicitnessValues,
  occurrenceRoles,
  relationshipValues,
} from "@/lib/document-model/types";

export function validateDocumentModel(
  value: unknown,
  documentId: string,
): DocumentModel {
  return validateDocumentModelValue(value, documentId, true) as DocumentModel;
}

export function validateGeneratedDocumentModel(
  value: unknown,
  documentId: string,
): GeneratedDocumentModel {
  return validateDocumentModelValue(
    value,
    documentId,
    false,
  ) as GeneratedDocumentModel;
}

function validateDocumentModelValue(
  value: unknown,
  documentId: string,
  requireHighlightBounds: boolean,
) {
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

  const pageLabels = validatePages(
    value.pages,
    requireHighlightBounds,
  );
  const conceptIds = validateConcepts(
    value.concepts,
    value.page_count,
    pageLabels,
  );
  validatePageChunks(value.pages, conceptIds, value.concepts);
  validateConnections(value.connections, conceptIds, value.page_count);

  return value;
}

function validatePages(
  pages: unknown[],
  requireHighlightBounds: boolean,
) {
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
        !isNonEmptyString(chunk.section_title) ||
        !isSourceText(chunk.source_text) ||
        !isNonEmptyString(chunk.title) ||
        !isSourceSummary(chunk.summary) ||
        !isStringArray(chunk.concept_ids, 1, 12) ||
        (requireHighlightBounds &&
          !isHighlightBounds(chunk.highlight_bounds))
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

function isHighlightBounds(value: unknown): value is SelectionBounds[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (bounds) =>
        isRecord(bounds) &&
        isUnitInterval(bounds.x) &&
        isUnitInterval(bounds.y) &&
        isPositiveUnitInterval(bounds.width) &&
        isPositiveUnitInterval(bounds.height) &&
        bounds.x + bounds.width <= 1 &&
        bounds.y + bounds.height <= 1,
    )
  );
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isPositiveUnitInterval(value: unknown): value is number {
  return typeof value === "number" && value > 0 && value <= 1;
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

function isSourceText(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= 8000;
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

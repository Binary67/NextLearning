import {
  explicitnessValues,
  occurrenceRoles,
  relationshipValues,
  type ConceptRelationship,
  type Explicitness,
  type OccurrenceRole,
} from "@/lib/document-model/types";
import {
  isNonEmptyString,
  isPositiveInteger,
  isRecord,
} from "@/lib/document-model/validation/guards";

export function validateConcepts(
  concepts: unknown[],
  startPage: number,
  endPage: number,
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
      concept.occurrences.length === 0
    ) {
      throw new Error("The generated document model has an invalid concept.");
    }

    conceptIds.add(concept.id);
    const occurrencePages = new Set<number>();

    for (const occurrence of concept.occurrences) {
      if (
        !isRecord(occurrence) ||
        !isPositiveInteger(occurrence.page_index) ||
        occurrence.page_index < startPage ||
        occurrence.page_index > endPage ||
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

export function validatePageChunks(
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

export function validateConnections(
  connections: unknown[],
  conceptIds: ReadonlySet<string>,
  pageCount: number,
  startPage = 1,
  endPage = pageCount,
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
      !connection.relevant_pages.every(
        (page) =>
          isPositiveInteger(page) &&
          page <= pageCount &&
          page >= startPage &&
          page <= endPage,
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

function isConceptId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^concept:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

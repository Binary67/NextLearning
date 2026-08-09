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
import type { GeneratedDocumentBatch } from "@/lib/document-batches";

export type GeneratedDocumentBatchValidationContext = {
  documentId: string;
  sourcePageCount: number;
  batchIndex: number;
  startPage: number;
  endPage: number;
};

export function validateGeneratedDocumentBatch(
  value: unknown,
  context: GeneratedDocumentBatchValidationContext,
): GeneratedDocumentBatch {
  if (
    !isPositiveInteger(context.batchIndex) ||
    !isPositiveInteger(context.sourcePageCount) ||
    !isPositiveInteger(context.startPage) ||
    !isPositiveInteger(context.endPage) ||
    context.startPage > context.endPage ||
    context.endPage > context.sourcePageCount ||
    !isNonEmptyString(context.documentId)
  ) {
    throw new Error("The generated document batch context is invalid.");
  }

  if (
    isRecord(value) &&
    ("batch_index" in value ||
      "start_page" in value ||
      "end_page" in value) &&
    (value.batch_index !== context.batchIndex ||
      value.start_page !== context.startPage ||
      value.end_page !== context.endPage)
  ) {
    throw new Error("The generated document batch has invalid identity.");
  }

  const model = validateDocumentModelValue(
    value,
    context.documentId,
    false,
    {
      startPage: context.startPage,
      endPage: context.endPage,
      pageCount: context.sourcePageCount,
    },
  ) as GeneratedDocumentModel;

  return {
    schema_version: model.schema_version,
    document_id: context.documentId,
    batch_index: context.batchIndex,
    start_page: context.startPage,
    end_page: context.endPage,
    title: model.title,
    page_count: context.sourcePageCount,
    pages: model.pages,
    concepts: model.concepts,
    connections: model.connections,
  };
}

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
  pageRange?: { startPage: number; endPage: number; pageCount: number },
) {
  if (!isRecord(value)) {
    throw new Error("The generated document model is not an object.");
  }

  const pageCount = pageRange?.pageCount ?? value.page_count;

  if (!isPositiveInteger(pageCount)) {
    throw new Error("The generated document model has invalid metadata.");
  }

  const startPage = pageRange?.startPage ?? 1;
  const endPage = pageRange?.endPage ?? pageCount;

  if (
    value.schema_version !== DOCUMENT_MODEL_SCHEMA_VERSION ||
    value.document_id !== documentId ||
    !isNonEmptyString(value.title) ||
    value.page_count !== pageCount ||
    !Array.isArray(value.pages) ||
    value.pages.length !== endPage - startPage + 1 ||
    !Array.isArray(value.concepts) ||
    value.concepts.length === 0 ||
    !Array.isArray(value.connections)
  ) {
    throw new Error("The generated document model has invalid metadata.");
  }

  const pageLabels = validatePages(
    value.pages,
    requireHighlightBounds,
    startPage,
  );
  const conceptIds = validateConcepts(
    value.concepts,
    startPage,
    endPage,
    pageLabels,
  );
  validatePageChunks(value.pages, conceptIds, value.concepts);
  validateConnections(
    value.connections,
    conceptIds,
    pageCount,
    startPage,
    endPage,
  );

  return value;
}

function validatePages(
  pages: unknown[],
  requireHighlightBounds: boolean,
  startPage = 1,
) {
  const pageLabels = new Map<number, string>();
  const chunkIds = new Set<string>();
  let chunkCount = 0;

  for (const [index, page] of pages.entries()) {
    if (
      !isRecord(page) ||
      page.page_index !== startPage + index ||
      !isNonEmptyString(page.page_label) ||
      !Array.isArray(page.chunks) ||
      page.chunks.length > 3
    ) {
      throw new Error("The generated document model has an invalid page.");
    }

    pageLabels.set(page.page_index, page.page_label);

    for (const [chunkIndex, chunk] of page.chunks.entries()) {
      if (!isRecord(chunk)) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          "the chunk must be an object",
        );
      }

      if (!isChunkId(chunk.id)) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          "id must be a lowercase kebab-case chunk ID",
        );
      }

      if (chunkIds.has(chunk.id)) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          "id is duplicated",
        );
      }

      if (!isNonEmptyString(chunk.section_title)) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          "section_title must be a non-empty string",
        );
      }

      const sourcesError = getChunkSourcesError(
        chunk.sources,
        page.page_index,
        requireHighlightBounds,
      );

      if (sourcesError) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          sourcesError,
        );
      }

      if (!isNonEmptyString(chunk.title)) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          "title must be a non-empty string",
        );
      }

      if (!isSourceSummary(chunk.summary)) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          "summary must contain 1 to 1600 characters",
        );
      }

      if (!isStringArray(chunk.concept_ids, 1, 12)) {
        throwInvalidPageChunk(
          page.page_index,
          chunkIndex,
          chunk,
          "concept_ids must contain 1 to 12 unique concept IDs",
        );
      }

      chunkIds.add(chunk.id);
      chunkCount += 1;
    }
  }

  if (chunkCount === 0) {
    throw new Error("The generated document model has invalid page chunks.");
  }

  return pageLabels;
}

function getChunkSourcesError(
  value: unknown,
  ownerPageIndex: number,
  requireHighlightBounds: boolean,
) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    return "sources must contain 1 to 4 ordered source spans";
  }

  let reachedOwnerPage = false;

  for (const [sourceIndex, source] of value.entries()) {
    if (!isRecord(source)) {
      return `source ${sourceIndex + 1} must be an object`;
    }

    if (
      !isPositiveInteger(source.page_index) ||
      (source.page_index !== ownerPageIndex &&
        source.page_index !== ownerPageIndex - 1)
    ) {
      return `source ${sourceIndex + 1} must belong to page ${ownerPageIndex} or its immediately previous page`;
    }

    if (source.page_index === ownerPageIndex) {
      reachedOwnerPage = true;
    } else if (reachedOwnerPage) {
      return "all previous-page sources must come before owning-page sources";
    }

    if (!isSourceText(source.source_text)) {
      return `source ${sourceIndex + 1} text must contain 1 to 8000 characters`;
    }

    if (
      requireHighlightBounds &&
      !isHighlightBounds(source.highlight_bounds)
    ) {
      return `source ${sourceIndex + 1} must have valid PDF highlight bounds`;
    }
  }

  return reachedOwnerPage
    ? null
    : `sources must include owning page ${ownerPageIndex}`;
}

function throwInvalidPageChunk(
  pageIndex: number,
  chunkIndex: number,
  chunk: unknown,
  reason: string,
): never {
  const chunkLabel =
    isRecord(chunk) && typeof chunk.id === "string"
      ? JSON.stringify(chunk.id)
      : `#${chunkIndex + 1}`;

  throw new Error(
    `The generated document model has an invalid page chunk on page ${pageIndex} (${chunkLabel}): ${reason}.`,
  );
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

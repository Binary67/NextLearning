import {
  DOCUMENT_MODEL_SCHEMA_VERSION,
  type DocumentModel,
  type GeneratedDocumentModel,
} from "@/lib/document-model/types";
import {
  validateConcepts,
  validateConnections,
  validatePageChunks,
} from "@/lib/document-model/validation/concept-graph";
import {
  isNonEmptyString,
  isPositiveInteger,
  isRecord,
} from "@/lib/document-model/validation/guards";
import { validatePages } from "@/lib/document-model/validation/pages";

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

export function validateDocumentModelValue(
  value: unknown,
  documentId: string,
  requireHighlightBounds: boolean,
  pageRange?: { startPage: number; endPage: number; pageCount: number },
): Record<string, unknown> {
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

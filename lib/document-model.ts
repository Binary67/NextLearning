export { documentModelJsonSchema } from "@/lib/document-model/schema";
export {
  buildSelectionGrounding,
  buildTextSelectionContext,
  summarizeDocumentModel,
} from "@/lib/document-model/selection";
export {
  DOCUMENT_MODEL_SCHEMA_VERSION,
  getDocumentChunkHighlightBounds,
  getDocumentChunkSourceText,
  getDocumentChunksForSourcePage,
} from "@/lib/document-model/types";
export type {
  ConceptOccurrence,
  ConceptRelationship,
  DocumentChunk,
  DocumentChunkSummary,
  DocumentConnection,
  DocumentConcept,
  DocumentMapSummary,
  DocumentModel,
  DocumentPage,
  DocumentSource,
  Explicitness,
  GeneratedDocumentChunk,
  GeneratedDocumentModel,
  GeneratedDocumentPage,
  GeneratedDocumentSource,
  OccurrenceRole,
  SelectionGrounding,
  SelectionRelatedPage,
  TextSelectionContext,
} from "@/lib/document-model/types";
export {
  validateDocumentModel,
  validateGeneratedDocumentModel,
} from "@/lib/document-model/validation/document-model";
export {
  validateGeneratedDocumentBatch,
  validateGroundedGeneratedDocumentBatch,
} from "@/lib/document-model/validation/generated-document-batch";
export type {
  GeneratedDocumentBatchValidationContext,
} from "@/lib/document-model/validation/generated-document-batch";

export { documentModelJsonSchema } from "@/lib/document-model/schema";
export {
  buildSelectionGrounding,
  buildTextSelectionContext,
  summarizeDocumentModel,
} from "@/lib/document-model/selection";
export { DOCUMENT_MODEL_SCHEMA_VERSION } from "@/lib/document-model/types";
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
  Explicitness,
  GeneratedDocumentChunk,
  GeneratedDocumentModel,
  GeneratedDocumentPage,
  OccurrenceRole,
  SelectionGrounding,
  SelectionRelatedPage,
  TextSelectionContext,
} from "@/lib/document-model/types";
export {
  validateDocumentModel,
  validateGeneratedDocumentModel,
} from "@/lib/document-model/validation";

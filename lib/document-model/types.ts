import type { SelectionBounds } from "@/lib/document-selection";

export const DOCUMENT_MODEL_SCHEMA_VERSION = 4;

export const occurrenceRoles = [
  "introduced",
  "defined",
  "explained",
  "illustrated",
  "applied",
  "assessed",
  "referenced",
] as const;

export const explicitnessValues = ["explicit", "implicit"] as const;

export const relationshipValues = [
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

export type GeneratedDocumentChunk = {
  id: string;
  section_title: string;
  source_text: string;
  title: string;
  summary: string;
  concept_ids: string[];
};

export type DocumentChunk = GeneratedDocumentChunk & {
  highlight_bounds: SelectionBounds[];
};

export type GeneratedDocumentPage = {
  page_index: number;
  page_label: string;
  chunks: GeneratedDocumentChunk[];
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

export type GeneratedDocumentModel = Omit<DocumentModel, "pages"> & {
  pages: GeneratedDocumentPage[];
};

export type DocumentChunkSummary = Omit<
  DocumentChunk,
  "source_text" | "highlight_bounds"
>;

export type DocumentMapSummary = {
  page_count: number;
  concept_count: number;
  connection_count: number;
};

export type SelectionRelatedPage = DocumentChunkSummary & {
  page_index: number;
  page_label: string;
};

export type TextSelectionContext = {
  selected_chunk: DocumentChunkSummary;
  related_pages: SelectionRelatedPage[];
};

export type SelectionGrounding = {
  current_page: {
    page_index: number;
    page_label: string;
  };
  current_chunks: DocumentChunkSummary[];
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
  related_chunks: SelectionRelatedPage[];
  text_selection: TextSelectionContext | null;
};

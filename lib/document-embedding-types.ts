import type {
  DocumentChunk,
  DocumentPage,
} from "@/lib/document-model";

export const DOCUMENT_EMBEDDINGS_SCHEMA_VERSION = 1;

export type DocumentEmbeddings = {
  schema_version: number;
  document_id: string;
  deployment: string;
  dimensions: number;
  chunks: Array<{
    chunk_id: string;
    embedding: number[];
  }>;
};

export type DocumentEmbeddingBatch = {
  batch_index: number;
  embeddings: DocumentEmbeddings;
};

export type DocumentTopicMatch = {
  page_index: number;
  page_label: string;
  title: string;
  summary: string;
  concepts: string[];
};

export type DocumentSearchIndex = {
  chunks: DocumentChunk[];
  conceptNames: ReadonlyMap<string, string>;
  pageByChunkId: ReadonlyMap<string, DocumentPage>;
  chunksBySourcePage: ReadonlyMap<number, DocumentChunk[]>;
  searchDataByChunkId: ReadonlyMap<
    string,
    {
      length: number;
      termCounts: ReadonlyMap<string, number>;
    }
  >;
  documentFrequency: ReadonlyMap<string, number>;
  averageDocumentLength: number;
};

export type RankedChunk = {
  chunk: DocumentChunk;
  embeddingSimilarity: number;
  bm25Score: number;
};

export type ScoredTopicChunk = {
  chunk: DocumentChunk;
  score: number;
};

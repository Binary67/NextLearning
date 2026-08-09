import type { DocumentBatchRange } from "@/lib/document-batches";
import {
  getDocumentChunkSourceText,
  type DocumentChunk,
  type DocumentModel,
} from "@/lib/document-model";
import { requestEmbeddings } from "@/lib/document-embedding-client";
import {
  DOCUMENT_EMBEDDINGS_SCHEMA_VERSION,
  type DocumentEmbeddingBatch,
  type DocumentEmbeddings,
} from "@/lib/document-embedding-types";

export async function generateDocumentEmbeddings(
  model: DocumentModel,
): Promise<DocumentEmbeddings> {
  const preparedChunks = prepareDocumentEmbeddingChunks(model);
  const { deployment, embeddings } = await requestEmbeddings(
    preparedChunks.map(({ searchText }) => searchText),
  );

  return buildDocumentEmbeddings(
    model,
    preparedChunks.map(({ chunk }) => chunk),
    deployment,
    getEmbeddingDimensions(embeddings),
    embeddings,
  );
}

export async function generateDocumentEmbeddingBatches(
  model: DocumentModel,
  batchRanges: readonly DocumentBatchRange[],
): Promise<DocumentEmbeddingBatch[]> {
  const preparedChunks = prepareDocumentEmbeddingChunks(model);
  const preparedChunksByRange = batchRanges.map((range) =>
    preparedChunks.filter(
      ({ pageIndex }) =>
        pageIndex >= range.start_page && pageIndex <= range.end_page,
    ),
  );
  const preparedChunksInRangeOrder = preparedChunksByRange.flat();
  const { deployment, embeddings } = await requestEmbeddings(
    preparedChunksInRangeOrder.map(({ searchText }) => searchText),
  );
  const dimensions = getEmbeddingDimensions(embeddings);

  let embeddingIndex = 0;

  return batchRanges.map((range, rangeIndex) => {
    const chunks = preparedChunksByRange[rangeIndex].map(
      ({ chunk }) => chunk,
    );
    const batchEmbeddings = embeddings.slice(
      embeddingIndex,
      embeddingIndex + chunks.length,
    );
    embeddingIndex += chunks.length;

    return {
      batch_index: range.batch_index,
      embeddings: buildDocumentEmbeddings(
        model,
        chunks,
        deployment,
        dimensions,
        batchEmbeddings,
      ),
    };
  });
}

export function buildChunkSearchText(
  chunk: DocumentChunk,
  conceptNames: ReadonlyMap<string, string>,
) {
  const concepts = chunk.concept_ids
    .map((conceptId) => conceptNames.get(conceptId) ?? "")
    .join(" ");

  return `${chunk.section_title}\n${chunk.title}\n${getDocumentChunkSourceText(chunk)}\n${chunk.summary}\n${concepts}`;
}

export function getConceptNames(model: DocumentModel) {
  return new Map(
    model.concepts.map((concept) => [concept.id, concept.name]),
  );
}

function prepareDocumentEmbeddingChunks(model: DocumentModel) {
  const conceptNames = getConceptNames(model);

  return model.pages.flatMap((page) =>
    page.chunks.map((chunk) => ({
      chunk,
      pageIndex: page.page_index,
      searchText: buildChunkSearchText(chunk, conceptNames),
    })),
  );
}

function getEmbeddingDimensions(embeddings: number[][]) {
  const dimensions = embeddings[0]?.length;

  if (!dimensions) {
    throw new Error("Azure OpenAI returned no document embeddings.");
  }

  return dimensions;
}

function buildDocumentEmbeddings(
  model: DocumentModel,
  chunks: DocumentChunk[],
  deployment: string,
  dimensions: number,
  embeddings: number[][],
): DocumentEmbeddings {
  return {
    schema_version: DOCUMENT_EMBEDDINGS_SCHEMA_VERSION,
    document_id: model.document_id,
    deployment,
    dimensions,
    chunks: chunks.map((chunk, index) => ({
      chunk_id: chunk.id,
      embedding: embeddings[index],
    })),
  };
}

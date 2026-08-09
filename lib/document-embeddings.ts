import {
  createAzureOpenAIResponseError,
  readAzureOpenAIEmbeddingConfiguration,
} from "@/lib/azure-openai-generation-retry";
import { readAzureOpenAIResponseError } from "@/lib/azure-openai-response";
import type { DocumentBatchRange } from "@/lib/document-batches";
import {
  buildTextSelectionContext,
  type DocumentChunk,
  type DocumentModel,
  type DocumentPage,
  type TextSelectionContext,
  getDocumentChunkSourceText,
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

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

type RankedChunk = {
  chunk: DocumentChunk;
  embeddingSimilarity: number;
  bm25Score: number;
};

export type DocumentTopicMatch = {
  page_index: number;
  page_label: string;
  title: string;
  summary: string;
  concepts: string[];
};

type DocumentSearchIndex = {
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

type ScoredTopicChunk = {
  chunk: DocumentChunk;
  score: number;
};

const documentSearchIndexes = new WeakMap<
  DocumentModel,
  DocumentSearchIndex
>();
const embeddingIndexes = new WeakMap<
  DocumentEmbeddings,
  ReadonlyMap<string, number[]>
>();

const EMBEDDING_WEIGHT = 0.7;
const BM25_WEIGHT = 0.3;
const EMBEDDING_BATCH_SIZE = 100;
const EMBEDDING_REQUEST_TIMEOUT_MS = 30 * 1000;
const BM25_K1 = 1.2;
const BM25_LENGTH_NORMALIZATION = 0.75;
const STOP_WORDS = new Set([
  "all",
  "also",
  "and",
  "are",
  "both",
  "can",
  "each",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "over",
  "that",
  "the",
  "this",
  "was",
  "were",
  "where",
  "with",
]);

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

export async function findTextSelectionContext(
  model: DocumentModel,
  documentEmbeddings: DocumentEmbeddings,
  pageIndex: number,
  selectionText: string,
  signal?: AbortSignal,
): Promise<TextSelectionContext | null> {
  const searchIndex = getDocumentSearchIndex(model);
  const pageChunks = searchIndex.chunksBySourcePage.get(pageIndex) ?? [];

  if (pageChunks.length === 0) {
    return null;
  }

  const { deployment, embeddings } = await requestEmbeddings(
    [selectionText],
    signal,
  );

  if (deployment !== documentEmbeddings.deployment) {
    throw new Error(
      "The tutorial embeddings use a different Azure OpenAI deployment.",
    );
  }

  const queryEmbedding = embeddings[0];

  if (queryEmbedding.length !== documentEmbeddings.dimensions) {
    throw new Error(
      "The tutorial embeddings use a different vector size.",
    );
  }

  const embeddingsByChunkId = getEmbeddingsByChunkId(documentEmbeddings);
  const { scores: bm25Scores, highestScore: highestBm25Score } =
    scoreChunksWithBm25(selectionText, searchIndex, pageChunks);
  const rankedChunks: RankedChunk[] = pageChunks.map((chunk) => ({
    chunk,
    embeddingSimilarity: dotProduct(
      queryEmbedding,
      embeddingsByChunkId.get(chunk.id) ?? [],
    ),
    bm25Score: bm25Scores.get(chunk.id) ?? 0,
  }));

  rankedChunks.sort((left, right) => {
    const leftScore = combinedScore(left, highestBm25Score);
    const rightScore = combinedScore(right, highestBm25Score);

    return (
      rightScore - leftScore ||
      left.chunk.id.localeCompare(right.chunk.id)
    );
  });

  return buildTextSelectionContext(
    model,
    pageIndex,
    rankedChunks[0].chunk,
    selectionText,
  );
}

export async function findHybridDocumentTopics(
  model: DocumentModel,
  documentEmbeddings: DocumentEmbeddings,
  query: string,
  signal?: AbortSignal,
): Promise<DocumentTopicMatch[]> {
  const searchIndex = getDocumentSearchIndex(model);
  const { deployment, embeddings } = await requestEmbeddings(
    [query],
    signal,
  );

  if (
    deployment !== documentEmbeddings.deployment ||
    embeddings[0].length !== documentEmbeddings.dimensions
  ) {
    throw new Error(
      "The tutorial embeddings use a different Azure OpenAI deployment.",
    );
  }

  const queryEmbedding = embeddings[0];
  const embeddingsByChunkId = getEmbeddingsByChunkId(documentEmbeddings);
  const { scores: bm25Scores, highestScore: highestBm25Score } =
    scoreChunksWithBm25(query, searchIndex, searchIndex.chunks);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const bestChunkByPage = new Map<number, ScoredTopicChunk>();

  for (const chunk of searchIndex.chunks) {
    const embedding = embeddingsByChunkId.get(chunk.id);
    const embeddingSimilarity = embedding
      ? dotProduct(queryEmbedding, embedding)
      : 0;
    const lexicalScore =
      highestBm25Score === 0
        ? 0
        : (bm25Scores.get(chunk.id) ?? 0) / highestBm25Score;
    const exactMatchBoost =
      normalizedQuery &&
      [chunk.section_title, chunk.title].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      )
        ? 0.15
        : 0;
    const page = searchIndex.pageByChunkId.get(chunk.id);

    if (!page) {
      continue;
    }

    const candidate = {
      chunk,
      score:
        EMBEDDING_WEIGHT * embeddingSimilarity +
        BM25_WEIGHT * lexicalScore +
        exactMatchBoost,
    };
    const currentBest = bestChunkByPage.get(page.page_index);

    if (!currentBest || compareScoredTopicChunks(candidate, currentBest) < 0) {
      bestChunkByPage.set(page.page_index, candidate);
    }
  }

  const topChunks: ScoredTopicChunk[] = [];

  for (const candidate of bestChunkByPage.values()) {
    const insertionIndex = topChunks.findIndex(
      (current) => compareScoredTopicChunks(candidate, current) < 0,
    );

    if (insertionIndex === -1) {
      if (topChunks.length < 5) {
        topChunks.push(candidate);
      }
      continue;
    }

    topChunks.splice(insertionIndex, 0, candidate);

    if (topChunks.length > 5) {
      topChunks.pop();
    }
  }

  return topChunks.map(({ chunk }) => {
    const page = searchIndex.pageByChunkId.get(chunk.id)!;

    return {
      page_index: page.page_index,
      page_label: page.page_label,
      title: chunk.title,
      summary: chunk.summary,
      concepts: chunk.concept_ids.flatMap((conceptId) => {
        const name = searchIndex.conceptNames.get(conceptId);
        return name ? [name] : [];
      }),
    };
  });
}

export function validateDocumentEmbeddings(
  value: unknown,
  model: DocumentModel,
): DocumentEmbeddings {
  if (
    !isRecord(value) ||
    value.schema_version !== DOCUMENT_EMBEDDINGS_SCHEMA_VERSION ||
    value.document_id !== model.document_id ||
    !isNonEmptyString(value.deployment) ||
    !isPositiveInteger(value.dimensions) ||
    !Array.isArray(value.chunks)
  ) {
    throw new Error("The saved document embeddings have invalid metadata.");
  }

  const expectedChunkIds = new Set(
    model.pages.flatMap((page) => page.chunks.map((chunk) => chunk.id)),
  );

  if (value.chunks.length !== expectedChunkIds.size) {
    throw new Error("The saved document embeddings are incomplete.");
  }

  const chunkIds = new Set<string>();
  const chunks = value.chunks.map((item) => {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.chunk_id) ||
      !expectedChunkIds.has(item.chunk_id) ||
      chunkIds.has(item.chunk_id) ||
      !Array.isArray(item.embedding) ||
      item.embedding.length !== value.dimensions ||
      !item.embedding.every(isFiniteNumber)
    ) {
      throw new Error("The saved document embeddings are invalid.");
    }

    chunkIds.add(item.chunk_id);

    return {
      chunk_id: item.chunk_id,
      embedding: item.embedding,
    };
  });

  return {
    schema_version: DOCUMENT_EMBEDDINGS_SCHEMA_VERSION,
    document_id: model.document_id,
    deployment: value.deployment,
    dimensions: value.dimensions,
    chunks,
  };
}

async function requestEmbeddings(
  inputs: string[],
  signal?: AbortSignal,
) {
  if (inputs.length === 0 || inputs.some((input) => !input.trim())) {
    throw new Error("Embedding input text is required.");
  }

  const { endpoint, apiKey, deployment } =
    readAzureOpenAIEmbeddingConfiguration();
  const embeddings: number[][] = [];

  for (let index = 0; index < inputs.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(index, index + EMBEDDING_BATCH_SIZE);
    embeddings.push(
      ...(await requestEmbeddingBatch(
        batch,
        endpoint,
        apiKey,
        deployment,
        signal,
      )),
    );
  }

  const dimensions = embeddings[0]?.length;

  if (
    !dimensions ||
    embeddings.some((embedding) => embedding.length !== dimensions)
  ) {
    throw new Error("Azure OpenAI returned inconsistent embeddings.");
  }

  return { deployment, embeddings };
}

async function requestEmbeddingBatch(
  inputs: string[],
  endpoint: string,
  apiKey: string,
  deployment: string,
  signal?: AbortSignal,
) {
  const timeoutSignal = AbortSignal.timeout(
    EMBEDDING_REQUEST_TIMEOUT_MS,
  );
  const response = await fetch(`${endpoint}/embeddings`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deployment,
      input: inputs,
      encoding_format: "float",
    }),
    signal: signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal,
  });
  const fallbackMessage = "Azure OpenAI could not create embeddings.";

  if (!response.ok) {
    throw createAzureOpenAIResponseError(
      response.status,
      await readAzureOpenAIResponseError(response),
      fallbackMessage,
      response.headers,
    );
  }

  const result = (await response.json()) as EmbeddingResponse;

  if (!Array.isArray(result.data) || result.data.length !== inputs.length) {
    throw new Error("Azure OpenAI returned invalid embeddings.");
  }

  const embeddings = new Array<number[]>(inputs.length);

  for (const item of result.data) {
    const index = item.index;

    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= inputs.length ||
      embeddings[index] ||
      !Array.isArray(item.embedding)
    ) {
      throw new Error("Azure OpenAI returned invalid embeddings.");
    }

    embeddings[index] = normalizeEmbedding(item.embedding);
  }

  return embeddings;
}

function scoreChunksWithBm25(
  query: string,
  searchIndex: DocumentSearchIndex,
  candidates: DocumentChunk[],
) {
  const queryTokens = new Set(tokenize(query));
  const scores = new Map<string, number>();
  let highestScore = 0;

  for (const chunk of candidates) {
    const searchData = searchIndex.searchDataByChunkId.get(chunk.id);
    let score = 0;

    if (searchData) {
      for (const token of queryTokens) {
        const termFrequency = searchData.termCounts.get(token) ?? 0;

        if (termFrequency === 0) {
          continue;
        }

        const frequency = searchIndex.documentFrequency.get(token) ?? 0;
        const inverseDocumentFrequency = Math.log(
          1 +
            (searchIndex.chunks.length - frequency + 0.5) /
              (frequency + 0.5),
        );
        const lengthNormalization =
          searchIndex.averageDocumentLength === 0
            ? 1
            : 1 -
              BM25_LENGTH_NORMALIZATION +
              BM25_LENGTH_NORMALIZATION *
                (searchData.length / searchIndex.averageDocumentLength);

        score +=
          inverseDocumentFrequency *
          ((termFrequency * (BM25_K1 + 1)) /
            (termFrequency + BM25_K1 * lengthNormalization));
      }
    }

    scores.set(chunk.id, score);
    highestScore = Math.max(highestScore, score);
  }

  return { scores, highestScore };
}

function getDocumentSearchIndex(model: DocumentModel) {
  const cached = documentSearchIndexes.get(model);

  if (cached) {
    return cached;
  }

  const conceptNames = getConceptNames(model);
  const chunks: DocumentChunk[] = [];
  const pageByChunkId = new Map<string, DocumentPage>();
  const chunksBySourcePage = new Map<number, DocumentChunk[]>();
  const searchDataByChunkId = new Map<
    string,
    {
      length: number;
      termCounts: ReadonlyMap<string, number>;
    }
  >();
  const documentFrequency = new Map<string, number>();
  let totalDocumentLength = 0;

  for (const page of model.pages) {
    for (const chunk of page.chunks) {
      chunks.push(chunk);
      pageByChunkId.set(chunk.id, page);

      for (const pageIndex of new Set(
        chunk.sources.map((source) => source.page_index),
      )) {
        const sourcePageChunks = chunksBySourcePage.get(pageIndex) ?? [];
        sourcePageChunks.push(chunk);
        chunksBySourcePage.set(pageIndex, sourcePageChunks);
      }

      const tokens = tokenize(buildChunkSearchText(chunk, conceptNames));
      const termCounts = countTerms(tokens);
      searchDataByChunkId.set(chunk.id, {
        length: tokens.length,
        termCounts,
      });
      totalDocumentLength += tokens.length;

      for (const token of termCounts.keys()) {
        documentFrequency.set(
          token,
          (documentFrequency.get(token) ?? 0) + 1,
        );
      }
    }
  }

  const searchIndex: DocumentSearchIndex = {
    chunks,
    conceptNames,
    pageByChunkId,
    chunksBySourcePage,
    searchDataByChunkId,
    documentFrequency,
    averageDocumentLength:
      chunks.length === 0 ? 0 : totalDocumentLength / chunks.length,
  };
  documentSearchIndexes.set(model, searchIndex);
  return searchIndex;
}

function getEmbeddingsByChunkId(documentEmbeddings: DocumentEmbeddings) {
  const cached = embeddingIndexes.get(documentEmbeddings);

  if (cached) {
    return cached;
  }

  const index = new Map(
    documentEmbeddings.chunks.map(({ chunk_id, embedding }) => [
      chunk_id,
      embedding,
    ]),
  );
  embeddingIndexes.set(documentEmbeddings, index);
  return index;
}

function compareScoredTopicChunks(
  left: ScoredTopicChunk,
  right: ScoredTopicChunk,
) {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return left.chunk.id.localeCompare(right.chunk.id);
}

function combinedScore(
  rankedChunk: RankedChunk,
  highestBm25Score: number,
) {
  const normalizedBm25Score =
    highestBm25Score === 0
      ? 0
      : rankedChunk.bm25Score / highestBm25Score;

  return (
    EMBEDDING_WEIGHT * rankedChunk.embeddingSimilarity +
    BM25_WEIGHT * normalizedBm25Score
  );
}

function buildChunkSearchText(
  chunk: DocumentChunk,
  conceptNames: ReadonlyMap<string, string>,
) {
  const concepts = chunk.concept_ids
    .map((conceptId) => conceptNames.get(conceptId) ?? "")
    .join(" ");

  return `${chunk.section_title}\n${chunk.title}\n${getDocumentChunkSourceText(chunk)}\n${chunk.summary}\n${concepts}`;
}

function normalizeEmbedding(value: number[]) {
  if (value.length === 0 || !value.every(isFiniteNumber)) {
    throw new Error("Azure OpenAI returned an invalid embedding vector.");
  }

  const magnitude = Math.sqrt(
    value.reduce((sum, number) => sum + number * number, 0),
  );

  if (magnitude === 0) {
    throw new Error("Azure OpenAI returned an empty embedding vector.");
  }

  return value.map((number) => number / magnitude);
}

function dotProduct(left: number[], right: number[]) {
  if (left.length !== right.length) {
    throw new Error("The document embedding vector size is invalid.");
  }

  return left.reduce(
    (score, number, index) => score + number * right[index],
    0,
  );
}

function tokenize(value: string) {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => word.length > 2 && !STOP_WORDS.has(word),
  );
}

function countTerms(tokens: string[]) {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
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

function getConceptNames(model: DocumentModel) {
  return new Map(
    model.concepts.map((concept) => [concept.id, concept.name]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

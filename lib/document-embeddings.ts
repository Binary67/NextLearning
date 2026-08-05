import {
  createAzureOpenAIResponseError,
  readAzureOpenAIEmbeddingConfiguration,
} from "@/lib/azure-openai-generation-retry";
import { readAzureOpenAIResponseError } from "@/lib/azure-openai-response";
import {
  buildTextSelectionContext,
  type DocumentChunk,
  type DocumentModel,
  type TextSelectionContext,
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
  const chunks = getDocumentChunks(model);
  const conceptNames = getConceptNames(model);
  const { deployment, embeddings } = await requestEmbeddings(
    chunks.map((chunk) => buildChunkSearchText(chunk, conceptNames)),
  );
  const dimensions = embeddings[0]?.length;

  if (!dimensions) {
    throw new Error("Azure OpenAI returned no document embeddings.");
  }

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

export async function findTextSelectionContext(
  model: DocumentModel,
  documentEmbeddings: DocumentEmbeddings,
  pageIndex: number,
  selectionText: string,
  signal?: AbortSignal,
): Promise<TextSelectionContext | null> {
  const page = model.pages[pageIndex - 1];

  if (!page?.chunks.length) {
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

  const embeddingsByChunkId = new Map(
    documentEmbeddings.chunks.map((item) => [
      item.chunk_id,
      item.embedding,
    ]),
  );
  const conceptNames = getConceptNames(model);
  const allChunks = getDocumentChunks(model);
  const bm25Scores = scoreChunksWithBm25(
    selectionText,
    allChunks,
    page.chunks,
    conceptNames,
  );
  const highestBm25Score = Math.max(0, ...bm25Scores.values());
  const rankedChunks: RankedChunk[] = page.chunks.map((chunk) => ({
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
    getDocumentChunks(model).map((chunk) => chunk.id),
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
  corpus: DocumentChunk[],
  candidates: DocumentChunk[],
  conceptNames: ReadonlyMap<string, string>,
) {
  const corpusTokens = corpus.map((chunk) =>
    [chunk.id, tokenize(buildChunkSearchText(chunk, conceptNames))] as const,
  );
  const tokensByChunkId = new Map(corpusTokens);
  const tokenizedDocuments = corpusTokens.map(([, tokens]) => tokens);
  const averageDocumentLength =
    tokenizedDocuments.reduce(
      (sum, tokens) => sum + tokens.length,
      0,
    ) / tokenizedDocuments.length;
  const queryTokens = new Set(tokenize(query));
  const documentFrequency = new Map<string, number>();

  for (const token of queryTokens) {
    documentFrequency.set(
      token,
      tokenizedDocuments.filter((tokens) => tokens.includes(token)).length,
    );
  }

  return new Map(
    candidates.map((chunk) => {
      const tokens = tokensByChunkId.get(chunk.id) ?? [];
      const termCounts = countTerms(tokens);
      let score = 0;

      for (const token of queryTokens) {
        const termFrequency = termCounts.get(token) ?? 0;

        if (termFrequency === 0) {
          continue;
        }

        const frequency = documentFrequency.get(token) ?? 0;
        const inverseDocumentFrequency = Math.log(
          1 + (corpus.length - frequency + 0.5) / (frequency + 0.5),
        );
        const lengthNormalization =
          1 -
          BM25_LENGTH_NORMALIZATION +
          BM25_LENGTH_NORMALIZATION *
            (tokens.length / averageDocumentLength);

        score +=
          inverseDocumentFrequency *
          ((termFrequency * (BM25_K1 + 1)) /
            (termFrequency + BM25_K1 * lengthNormalization));
      }

      return [chunk.id, score];
    }),
  );
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

  return `${chunk.section_title}\n${chunk.title}\n${chunk.source_text}\n${chunk.summary}\n${concepts}`;
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

function getDocumentChunks(model: DocumentModel) {
  return model.pages.flatMap((page) => page.chunks);
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

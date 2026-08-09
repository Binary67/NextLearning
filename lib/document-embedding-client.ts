import { createHash } from "node:crypto";

import {
  createAzureOpenAIResponseError,
  readAzureOpenAIEmbeddingConfiguration,
  retryAzureOpenAIRequest,
} from "@/lib/azure-openai-generation-retry";
import { readAzureOpenAIResponseError } from "@/lib/azure-openai-response";
import { LruPromiseCache } from "@/lib/lru-promise-cache";

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

const EMBEDDING_BATCH_SIZE = 100;
const EMBEDDING_REQUEST_TIMEOUT_MS = 30 * 1000;
const EMBEDDING_REQUEST_CONCURRENCY = 4;
const EMBEDDING_QUERY_CACHE_CAPACITY = 256;

const queryEmbeddingCache = new LruPromiseCache<string, number[]>(
  EMBEDDING_QUERY_CACHE_CAPACITY,
);

export async function requestEmbeddings(
  inputs: string[],
  signal?: AbortSignal,
) {
  if (inputs.length === 0 || inputs.some((input) => !input.trim())) {
    throw new Error("Embedding input text is required.");
  }

  const { endpoint, apiKey, deployment } =
    readAzureOpenAIEmbeddingConfiguration();

  if (inputs.length === 1) {
    const embedding = await queryEmbeddingCache.getOrCreate(
      queryEmbeddingCacheKey(deployment, inputs[0]),
      () =>
        retryAzureOpenAIRequest(
          () =>
            requestEmbeddingBatch(
              [inputs[0]],
              endpoint,
              apiKey,
              deployment,
              signal,
            ),
          signal,
        ).then(([batchEmbedding]) => batchEmbedding),
    );

    return { deployment, embeddings: [embedding] };
  }

  const embeddings = await requestEmbeddingBatches(
    inputs,
    endpoint,
    apiKey,
    deployment,
    signal,
  );

  const dimensions = embeddings[0]?.length;

  if (
    !dimensions ||
    embeddings.some((embedding) => embedding.length !== dimensions)
  ) {
    throw new Error("Azure OpenAI returned inconsistent embeddings.");
  }

  return { deployment, embeddings };
}

async function requestEmbeddingBatches(
  inputs: string[],
  endpoint: string,
  apiKey: string,
  deployment: string,
  signal?: AbortSignal,
) {
  const embeddings = new Array<number[]>(inputs.length);
  const batchCount = Math.ceil(inputs.length / EMBEDDING_BATCH_SIZE);
  let nextBatchIndex = 0;

  async function runWorker() {
    for (;;) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;

      if (batchIndex >= batchCount) {
        return;
      }

      const batchStart = batchIndex * EMBEDDING_BATCH_SIZE;
      const batch = inputs.slice(
        batchStart,
        batchStart + EMBEDDING_BATCH_SIZE,
      );
      const batchEmbeddings = await retryAzureOpenAIRequest(
        () =>
          requestEmbeddingBatch(
            batch,
            endpoint,
            apiKey,
            deployment,
            signal,
          ),
        signal,
      );

      for (let offset = 0; offset < batchEmbeddings.length; offset += 1) {
        embeddings[batchStart + offset] = batchEmbeddings[offset];
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(EMBEDDING_REQUEST_CONCURRENCY, batchCount) },
    () => runWorker(),
  );

  await Promise.all(workers);

  return embeddings;
}

function queryEmbeddingCacheKey(deployment: string, input: string) {
  return createHash("sha256")
    .update(`${deployment}\0${input}`)
    .digest("hex");
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

function normalizeEmbedding(value: number[]) {
  if (value.length === 0) {
    throw new Error("Azure OpenAI returned an invalid embedding vector.");
  }

  let magnitudeSquared = 0;

  for (const number of value) {
    if (!isFiniteNumber(number)) {
      throw new Error("Azure OpenAI returned an invalid embedding vector.");
    }

    magnitudeSquared += number * number;
  }

  if (magnitudeSquared === 0) {
    throw new Error("Azure OpenAI returned an empty embedding vector.");
  }

  const magnitude = Math.sqrt(magnitudeSquared);

  return value.map((number) => number / magnitude);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

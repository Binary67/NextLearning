import {
  createAzureOpenAIResponseError,
  readAzureOpenAIEmbeddingConfiguration,
  retryAzureOpenAIRequest,
} from "@/lib/azure-openai-generation-retry";
import { readAzureOpenAIResponseError } from "@/lib/azure-openai-response";

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

const EMBEDDING_BATCH_SIZE = 100;
const EMBEDDING_REQUEST_TIMEOUT_MS = 30 * 1000;

export async function requestEmbeddings(
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
      ...(await retryAzureOpenAIRequest(
        () =>
          requestEmbeddingBatch(
            batch,
            endpoint,
            apiKey,
            deployment,
            signal,
          ),
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type AzureOpenAIErrorDetails = {
  type?: string;
  code?: string | null;
  message?: string;
} | null;

export class MissingAzureOpenAIConfigurationError extends Error {}

export class RetryableAzureOpenAIError extends Error {}

export class RateLimitedAzureOpenAIError extends Error {
  constructor(
    message: string,
    readonly retryAfterMilliseconds: number | null,
  ) {
    super(message);
  }
}

export class InvalidAzureOpenAIContentError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}

export async function retryAzureOpenAIGeneration<T>(
  generate: () => Promise<T>,
): Promise<T> {
  try {
    return await generate();
  } catch (error) {
    if (
      !(error instanceof RetryableAzureOpenAIError) &&
      !(error instanceof InvalidAzureOpenAIContentError)
    ) {
      throw error;
    }
  }

  return generate();
}

const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30 * 1000;

export async function retryAzureOpenAIRequest<T>(
  request: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    signal?.throwIfAborted();

    try {
      return await request();
    } catch (error) {
      signal?.throwIfAborted();

      if (
        (!(error instanceof RateLimitedAzureOpenAIError) &&
          !(error instanceof RetryableAzureOpenAIError)) ||
        retryCount === MAX_RATE_LIMIT_RETRIES
      ) {
        throw error;
      }

      const delay = Math.max(
        0,
        Math.min(
          error instanceof RateLimitedAzureOpenAIError
            ? (error.retryAfterMilliseconds ??
              DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** retryCount)
            : DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** retryCount,
          MAX_RETRY_DELAY_MS,
        ),
      );
      await delayWithAbort(delay, signal);
      retryCount += 1;
    }
  }
}

export async function retryAzureOpenAIRateLimits<T>(
  generate: () => Promise<T>,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await generate();
    } catch (error) {
      if (
        !(error instanceof RateLimitedAzureOpenAIError) ||
        retryCount === MAX_RATE_LIMIT_RETRIES
      ) {
        throw error;
      }

      const delay = Math.max(
        0,
        Math.min(
          error.retryAfterMilliseconds ??
            DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** retryCount,
          MAX_RETRY_DELAY_MS,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      retryCount += 1;
    }
  }
}

function delayWithAbort(delay: number, signal?: AbortSignal) {
  if (!signal) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, delay);
    return promise;
  }

  const abortSignal = signal;
  abortSignal.throwIfAborted();

  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const timeout = setTimeout(() => {
    abortSignal.removeEventListener("abort", onAbort);
    resolve();
  }, delay);

  function onAbort() {
    clearTimeout(timeout);
    reject(abortSignal.reason);
  }

  abortSignal.addEventListener("abort", onAbort, { once: true });
  return promise;
}

export function readAzureOpenAIGenerationConfiguration() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_FLAGSHIP_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    throw new MissingAzureOpenAIConfigurationError(
      "Azure OpenAI endpoint, API key, and flagship deployment are required.",
    );
  }

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    apiKey,
    deployment,
  };
}

export function readAzureOpenAIEmbeddingConfiguration() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    throw new MissingAzureOpenAIConfigurationError(
      "Azure OpenAI endpoint, API key, and embedding deployment are required.",
    );
  }

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    apiKey,
    deployment,
  };
}

export function createAzureOpenAIResponseError(
  status: number,
  error: AzureOpenAIErrorDetails | undefined,
  fallbackMessage: string,
  headers?: Headers,
) {
  const message = error?.message ?? fallbackMessage;

  if (status === 429) {
    return new RateLimitedAzureOpenAIError(
      message,
      readRetryAfterMilliseconds(headers),
    );
  }

  if (
    status >= 500 ||
    error?.type === "model_error" ||
    error?.code === "model_error" ||
    message.toLowerCase().includes("model produced invalid content")
  ) {
    return new RetryableAzureOpenAIError(message);
  }

  return new Error(message);
}

function readRetryAfterMilliseconds(headers?: Headers) {
  if (!headers) {
    return null;
  }

  const millisecondsHeader = headers.get("retry-after-ms");

  if (millisecondsHeader !== null) {
    const milliseconds = Number(millisecondsHeader);

    if (Number.isFinite(milliseconds) && milliseconds >= 0) {
      return milliseconds;
    }
  }

  const retryAfter = headers.get("retry-after");

  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now());
}

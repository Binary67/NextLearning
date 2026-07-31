export type AzureOpenAIErrorDetails = {
  type?: string;
  code?: string | null;
  message?: string;
} | null;

export class RetryableAzureOpenAIError extends Error {}

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

export function createAzureOpenAIResponseError(
  status: number,
  error: AzureOpenAIErrorDetails | undefined,
  fallbackMessage: string,
) {
  const message = error?.message ?? fallbackMessage;

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

import {
  type AzureOpenAIErrorDetails,
  createAzureOpenAIResponseError,
} from "@/lib/azure-openai-generation-retry";

export type AzureOpenAIResponse = {
  status?: string;
  error?: AzureOpenAIErrorDetails;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

type AzureOpenAIResponseWithError = {
  error?: AzureOpenAIErrorDetails;
};

type AzureOpenAIStreamEvent<T> = {
  type?: string;
  response?: T;
  error?: AzureOpenAIErrorDetails;
};

export async function readAzureOpenAIResponseStream<
  T extends AzureOpenAIResponseWithError,
>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw createAzureOpenAIResponseError(
      response.status,
      await readAzureOpenAIResponseError(response),
      fallbackMessage,
      response.headers,
    );
  }

  if (!response.body) {
    throw new Error(fallbackMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = done ? "" : (blocks.pop() ?? "");

    for (const block of blocks) {
      const event = parseStreamEvent<T>(block);

      if (!event) {
        continue;
      }

      if (event.type === "response.completed" && event.response) {
        await reader.cancel().catch(() => {});
        return event.response;
      }

      if (event.type === "response.failed" || event.type === "error") {
        throw createAzureOpenAIResponseError(
          500,
          event.response?.error ?? event.error,
          fallbackMessage,
        );
      }
    }

    if (done) {
      break;
    }
  }

  throw new Error(fallbackMessage);
}

export async function readAzureOpenAIResponseError(response: Response) {
  let result: unknown;

  try {
    result = await response.json();
  } catch {
    return undefined;
  }

  if (!isRecord(result)) {
    return undefined;
  }

  const error = result.error;

  if (error === null) {
    return null;
  }

  if (!isRecord(error)) {
    return undefined;
  }

  return {
    type: typeof error.type === "string" ? error.type : undefined,
    code:
      typeof error.code === "string" || error.code === null
        ? error.code
        : undefined,
    message:
      typeof error.message === "string" ? error.message : undefined,
  };
}

export function readAzureOpenAIOutputText(
  result: AzureOpenAIResponse,
  refusalMessage: string,
  missingOutputMessage: string,
) {
  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        throw new Error(content.refusal ?? refusalMessage);
      }

      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  throw new Error(missingOutputMessage);
}

function parseStreamEvent<T>(
  block: string,
): AzureOpenAIStreamEvent<T> | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") {
    return null;
  }

  return JSON.parse(data) as AzureOpenAIStreamEvent<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

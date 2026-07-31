type AzureOpenAIResponseWithError = {
  error?: {
    message?: string;
  } | null;
};

type AzureOpenAIStreamEvent<T> = {
  type?: string;
  response?: T;
  error?: {
    message?: string;
  };
};

export async function readAzureOpenAIResponseStream<
  T extends AzureOpenAIResponseWithError,
>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const result = (await response.json()) as T;
    throw new Error(result.error?.message ?? fallbackMessage);
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
        throw new Error(
          event.response?.error?.message ??
            event.error?.message ??
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

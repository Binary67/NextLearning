import { describe, expect, it } from "vitest";

import {
  RateLimitedAzureOpenAIError,
  RetryableAzureOpenAIError,
} from "@/lib/azure-openai-generation-retry";
import {
  type AzureOpenAIResponse,
  readAzureOpenAIResponseStream,
} from "@/lib/azure-openai-response";

describe("readAzureOpenAIResponseStream", () => {
  it("classifies a non-JSON 429 and preserves Retry-After", async () => {
    const request = readAzureOpenAIResponseStream<AzureOpenAIResponse>(
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "2" },
      }),
      "Azure OpenAI request failed.",
    );

    await expect(request).rejects.toBeInstanceOf(
      RateLimitedAzureOpenAIError,
    );
    await expect(request).rejects.toMatchObject({
      message: "Azure OpenAI request failed.",
      retryAfterMilliseconds: 2000,
    });
  });

  it("classifies a non-JSON 5xx as retryable", async () => {
    const request = readAzureOpenAIResponseStream<AzureOpenAIResponse>(
      new Response("<html>Service unavailable</html>", { status: 503 }),
      "Azure OpenAI request failed.",
    );

    await expect(request).rejects.toBeInstanceOf(
      RetryableAzureOpenAIError,
    );
    await expect(request).rejects.toThrow(
      "Azure OpenAI request failed.",
    );
  });

  it("keeps successful stream parsing unchanged", async () => {
    const response = new Response(
      'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
    );

    await expect(
      readAzureOpenAIResponseStream<AzureOpenAIResponse>(
        response,
        "Azure OpenAI request failed.",
      ),
    ).resolves.toEqual({ status: "completed" });
  });
});

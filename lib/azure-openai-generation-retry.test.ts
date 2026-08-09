import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RateLimitedAzureOpenAIError,
  RetryableAzureOpenAIError,
  retryAzureOpenAIRequest,
} from "@/lib/azure-openai-generation-retry";

describe("retryAzureOpenAIRequest", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries transient failures with exponential backoff", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableAzureOpenAIError("unavailable"))
      .mockRejectedValueOnce(new RetryableAzureOpenAIError("unavailable"))
      .mockResolvedValue("ok");

    const result = retryAzureOpenAIRequest(request);

    await vi.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("honors Retry-After and caps an excessive delay", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new RateLimitedAzureOpenAIError("rate limited", 999_999),
      )
      .mockResolvedValue("ok");

    const result = retryAzureOpenAIRequest(request);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("aborts a pending retry delay", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const cancellation = new DOMException("Cancelled", "AbortError");
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new RetryableAzureOpenAIError("unavailable"));

    const result = retryAzureOpenAIRequest(request, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(cancellation);

    await expect(result).rejects.toBe(cancellation);
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not call the operation after caller cancellation", async () => {
    const controller = new AbortController();
    const cancellation = new DOMException("Cancelled", "AbortError");
    controller.abort(cancellation);
    const request = vi.fn<() => Promise<string>>();

    await expect(
      retryAzureOpenAIRequest(request, controller.signal),
    ).rejects.toBe(cancellation);
    expect(request).not.toHaveBeenCalled();
  });
});

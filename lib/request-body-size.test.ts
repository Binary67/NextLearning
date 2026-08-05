import { describe, expect, it } from "vitest";

import {
  isContentLengthOverLimit,
  isMultipartFormDataContentType,
  isUtf8TextOverLimit,
  readRequestBytesWithLimit,
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/request-body-size";

describe("isMultipartFormDataContentType", () => {
  it("accepts multipart form data with casing and parameters", () => {
    expect(
      isMultipartFormDataContentType(
        "Multipart/Form-Data; boundary=upload",
      ),
    ).toBe(true);
  });

  it("rejects missing and other content types", () => {
    expect(isMultipartFormDataContentType(null)).toBe(false);
    expect(
      isMultipartFormDataContentType("application/pdf"),
    ).toBe(false);
  });
});

describe("isContentLengthOverLimit", () => {
  const maxBytes = 64 * 1024;

  it("rejects a valid numeric length above the limit", () => {
    expect(
      isContentLengthOverLimit(String(maxBytes + 1), maxBytes),
    ).toBe(true);
    expect(
      isContentLengthOverLimit(
        "999999999999999999999999999999",
        maxBytes,
      ),
    ).toBe(true);
  });

  it("allows valid numeric lengths at or below the limit", () => {
    expect(
      isContentLengthOverLimit(String(maxBytes), maxBytes),
    ).toBe(false);
    expect(isContentLengthOverLimit("0", maxBytes)).toBe(false);
  });

  it("allows missing or malformed lengths through", () => {
    expect(isContentLengthOverLimit(null, maxBytes)).toBe(false);
    expect(isContentLengthOverLimit("", maxBytes)).toBe(false);
    expect(
      isContentLengthOverLimit("not-a-number", maxBytes),
    ).toBe(false);
    expect(
      isContentLengthOverLimit(String(maxBytes + 0.5), maxBytes),
    ).toBe(false);
    expect(isContentLengthOverLimit("-1", maxBytes)).toBe(false);
  });
});

describe("isUtf8TextOverLimit", () => {
  const maxBytes = 64 * 1024;

  it("allows the exact route limit and rejects one byte more", () => {
    expect(
      isUtf8TextOverLimit("a".repeat(maxBytes), maxBytes),
    ).toBe(false);
    expect(
      isUtf8TextOverLimit("a".repeat(maxBytes + 1), maxBytes),
    ).toBe(true);
  });

  it("uses UTF-8 byte length and allows the exact limit", () => {
    expect(isUtf8TextOverLimit("éé", 4)).toBe(false);
    expect(isUtf8TextOverLimit("éé", 3)).toBe(true);
  });
});

describe("readRequestBytesWithLimit", () => {
  it("accepts an exact-limit body assembled from multiple chunks", async () => {
    const request = createStreamingRequest([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]);

    await expect(
      readRequestBytesWithLimit(request, 4),
    ).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-number"],
    ["understated", "1"],
  ])(
    "rejects an oversized body with %s Content-Length",
    async (_description, contentLength) => {
      const request = createStreamingRequest(
        [new Uint8Array([1, 2, 3, 4, 5])],
        contentLength,
      );

      await expect(
        readRequestBytesWithLimit(request, 4),
      ).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    },
  );

  it("cancels the request stream after the limit is exceeded", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = createRequest(stream);

    await expect(
      readRequestBytesWithLimit(request, 2),
    ).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(cancelled).toBe(true);
  });

  it("accepts an empty request body", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
    });

    await expect(
      readRequestBytesWithLimit(request, 0),
    ).resolves.toEqual(new Uint8Array());
  });
});

describe("readRequestTextWithLimit", () => {
  it("counts UTF-8 bytes and accepts the exact limit", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "éé",
    });

    await expect(
      readRequestTextWithLimit(request, 4),
    ).resolves.toBe("éé");
  });

  it("rejects text whose UTF-8 bytes exceed the limit", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "éé",
    });

    await expect(
      readRequestTextWithLimit(request, 3),
    ).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});

function createStreamingRequest(
  chunks: Uint8Array[],
  contentLength?: string,
) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });

  return createRequest(stream, contentLength);
}

function createRequest(
  body: ReadableStream<Uint8Array>,
  contentLength?: string,
) {
  return new Request("http://localhost", {
    method: "POST",
    body,
    duplex: "half",
    headers:
      contentLength === undefined
        ? undefined
        : { "Content-Length": contentLength },
  } as RequestInit & { duplex: "half" });
}

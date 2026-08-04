import { describe, expect, it } from "vitest";

import {
  isContentLengthOverLimit,
  isMultipartFormDataContentType,
  isUtf8TextOverLimit,
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

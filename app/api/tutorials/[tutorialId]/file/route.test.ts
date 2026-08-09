import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readStoredTutorial: vi.fn(),
  statDocumentFile: vi.fn(),
  streamDocumentFile: vi.fn(),
}));

vi.mock("@/lib/tutorial-storage", () => ({
  isTutorialId: () => true,
  readStoredTutorial: mocks.readStoredTutorial,
}));

vi.mock("@/lib/document-artifact-storage", () => ({
  statDocumentFile: mocks.statDocumentFile,
  streamDocumentFile: mocks.streamDocumentFile,
}));

import { GET } from "@/app/api/tutorials/[tutorialId]/file/route";

const tutorialId = "tutorial-id";
const routeContext = {
  params: Promise.resolve({ tutorialId }),
};
const fileBytes = Uint8Array.from([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
]);
const etag = '"document-etag"';

describe("tutorial PDF file route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readStoredTutorial.mockResolvedValue({
      documentName: "Guide & notes.pdf",
    });
    mocks.statDocumentFile.mockResolvedValue({
      etag,
      size: fileBytes.byteLength,
    });
    mocks.streamDocumentFile.mockImplementation(
      (_tutorialId: string, range?: { start: number; end: number }) => {
        const bytes = range
          ? fileBytes.slice(range.start, range.end + 1)
          : fileBytes;

        return new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        });
      },
    );
  });

  it("streams a full inline PDF with immutable validators", async () => {
    const response = await GET(createRequest(), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      "inline; filename*=UTF-8''Guide%20%26%20notes.pdf",
    );
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("ETag")).toBe(etag);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(fileBytes);
    expect(mocks.streamDocumentFile).toHaveBeenCalledWith(tutorialId);
  });

  it.each([
    ["closed", "bytes=2-5", { start: 2, end: 5 }, "2-5", [2, 3, 4, 5]],
    ["open-ended", "bytes=7-", { start: 7, end: 9 }, "7-9", [7, 8, 9]],
    ["suffix", "bytes=-3", { start: 7, end: 9 }, "7-9", [7, 8, 9]],
  ])(
    "streams a %s byte range",
    async (_name, rangeHeader, range, contentRange, expectedBytes) => {
      const response = await GET(
        createRequest({ Range: rangeHeader }),
        routeContext,
      );

      expect(response.status).toBe(206);
      expect(response.headers.get("Accept-Ranges")).toBe("bytes");
      expect(response.headers.get("Cache-Control")).toBe(
        "private, max-age=31536000, immutable",
      );
      expect(response.headers.get("Content-Disposition")).toMatch(
        /^inline;/,
      );
      expect(response.headers.get("Content-Length")).toBe(
        String(expectedBytes.length),
      );
      expect(response.headers.get("Content-Range")).toBe(
        `bytes ${contentRange}/10`,
      );
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(response.headers.get("ETag")).toBe(etag);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        Uint8Array.from(expectedBytes),
      );
      expect(mocks.streamDocumentFile).toHaveBeenCalledWith(
        tutorialId,
        range,
      );
    },
  );

  it.each([
    ["malformed", "bytes=wrong"],
    ["multiple", "bytes=0-1,4-5"],
    ["unsatisfiable start", "bytes=10-"],
    ["reversed", "bytes=7-4"],
    ["empty suffix", "bytes=-0"],
  ])("rejects a %s range", async (_name, rangeHeader) => {
    const response = await GET(
      createRequest({ Range: rangeHeader }),
      routeContext,
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
    expect(mocks.streamDocumentFile).not.toHaveBeenCalled();
  });

  it("returns 304 for a matching non-range ETag", async () => {
    const response = await GET(
      createRequest({ "If-None-Match": etag }),
      routeContext,
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers.get("ETag")).toBe(etag);
    expect(mocks.streamDocumentFile).not.toHaveBeenCalled();
  });

  it("ignores If-None-Match for range requests", async () => {
    const response = await GET(
      createRequest({
        "If-None-Match": etag,
        Range: "bytes=0-1",
      }),
      routeContext,
    );

    expect(response.status).toBe(206);
  });

  it("preserves attachment downloads", async () => {
    const response = await GET(
      createRequest(undefined, "?download=1"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''Guide%20%26%20notes.pdf",
    );
  });
});

function createRequest(
  headers?: HeadersInit,
  search = "",
) {
  return new Request(
    `http://localhost/api/tutorials/${tutorialId}/file${search}`,
    { headers },
  );
}

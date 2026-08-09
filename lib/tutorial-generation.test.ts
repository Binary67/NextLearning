import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDocumentBatchPrompt,
  buildDocumentPageText,
  generateDocumentBatch,
} from "@/lib/tutorial-generation";

const { getDocument } = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument }));

describe("generateDocumentBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://azure.example");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "api-key");
    vi.stubEnv("AZURE_OPENAI_FLAGSHIP_DEPLOYMENT", "flagship");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("aborts generation requests after fifteen minutes", async () => {
    const timeoutController = new AbortController();
    const timeoutError = new DOMException(
      "The operation timed out.",
      "TimeoutError",
    );
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutController.signal);
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    mockPdfPages(["Page one extracted text."]);
    const request = generateDocumentBatch(
      Buffer.from("pdf"),
      "document.pdf",
      "document-id",
      1,
      1,
      1,
      1,
      1,
      1,
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(timeout).toHaveBeenCalledWith(15 * 60 * 1000);
    const requestBody = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    );
    const prompt = requestBody.input[0].content[1].text as string;
    const chunkSchema =
      requestBody.text.format.schema.properties.pages.items.properties
        .chunks;
    expect(prompt).toContain(
      "Normally give each substantive page one chunk",
    );
    expect(prompt).toContain(
      "Multiple sources may use the same page",
    );
    expect(prompt).toContain(
      "Assign the complete paragraph to the next page's chunk",
    );
    expect(prompt).toContain(
      "previous-page fragment followed by the owning-page fragment",
    );
    expect(chunkSchema.description).toContain("At most three");
    expect(
      chunkSchema.items.properties.sources.description,
    ).toContain("One to four");
    expect(
      chunkSchema.items.properties.concept_ids.description,
    ).toContain("One to twelve");

    timeoutController.abort(timeoutError);

    await expect(request).rejects.toBe(timeoutError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a generated batch whose sources do not ground in the attached PDF", async () => {
    mockPdfPages(["Boundary context", "Grounded source text"]);
    const invalidOutput = createGeneratedBatchOutput(
      "Invented source text",
    );
    const validOutput = createGeneratedBatchOutput(
      "Grounded source text",
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(streamedOutput(invalidOutput))
      .mockResolvedValueOnce(streamedOutput(validOutput));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateDocumentBatch(
      Buffer.from("pdf"),
      "document.pdf",
      "document-id",
      3,
      1,
      3,
      3,
      2,
      3,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(result.pages[0].chunks[0].sources[0]).toEqual({
      page_index: 3,
      source_text: "Grounded source text",
    });
  });

  it("wraps final grounding failures with precise source details", async () => {
    mockPdfPages(["Grounded source text"]);
    const output = createGeneratedBatchOutput("Invented source text", 1);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async () =>
        streamedOutput(output),
      ),
    );

    await expect(
      generateDocumentBatch(
        Buffer.from("pdf"),
        "document.pdf",
        "document-id",
        1,
        1,
        1,
        1,
        1,
        1,
      ),
    ).rejects.toThrow(
      'Chunk chunk:p1-grounding, source 1, PDF page 1: source token "invented" is missing from the PDF page.',
    );
  });
});

function createGeneratedBatchOutput(sourceText: string, pageIndex = 3) {
  return {
    schema_version: 5,
    document_id: "document-id",
    title: "Document",
    page_count: pageIndex,
    pages: [
      {
        page_index: pageIndex,
        page_label: String(pageIndex),
        chunks: [
          {
            id: `chunk:p${pageIndex}-grounding`,
            section_title: "Section",
            sources: [
              {
                page_index: pageIndex,
                source_text: sourceText,
              },
            ],
            title: "Grounding",
            summary: "A grounded teaching chunk.",
            concept_ids: ["concept:grounding"],
          },
        ],
      },
    ],
    concepts: [
      {
        id: "concept:grounding",
        name: "Grounding",
        definition: "Source text verified against a PDF.",
        occurrences: [
          {
            page_index: pageIndex,
            page_label: String(pageIndex),
            role: "explained",
            explicitness: "explicit",
            confidence: 1,
          },
        ],
      },
    ],
    connections: [],
  };
}

function mockPdfPages(pageTexts: string[]) {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: pageTexts.length,
      getPage: vi.fn().mockImplementation(async (pageIndex: number) => ({
        getViewport: () => ({
          width: 100,
          height: 100,
          scale: 1,
          transform: [1, 0, 0, 1, 0, 0],
        }),
        getTextContent: () =>
          Promise.resolve({
            items: [
              {
                str: pageTexts[pageIndex - 1],
                transform: [1, 0, 0, 1, 10, 70],
                width: 80,
              },
            ],
          }),
      })),
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
}

function streamedOutput(output: object) {
  const event = {
    type: "response.completed",
    response: {
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify(output),
            },
          ],
        },
      ],
    },
  };

  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("buildDocumentPageText", () => {
  it("marks each page and joins its text regions", () => {
    const text = buildDocumentPageText(
      [
        [
          {
            text: "First  page ",
            x: 0,
            y: 0,
            width: 1,
            height: 0.1,
          },
        ],
        [
          {
            text: "Second",
            x: 0,
            y: 0,
            width: 1,
            height: 0.1,
          },
          {
            text: " page",
            x: 0,
            y: 0,
            width: 1,
            height: 0.1,
          },
        ],
      ],
      3,
    );

    expect(text).toBe("Page 3:\nFirst page\n\nPage 4:\nSecond page");
  });
});

describe("buildDocumentBatchPrompt", () => {
  it("includes the extracted page text for verbatim quoting", () => {
    const prompt = buildDocumentBatchPrompt(
      "document-id",
      10,
      1,
      2,
      1,
      2,
      "Page 1:\nHello world",
    );

    expect(prompt).toContain(
      "source_text copied verbatim from the extracted text",
    );
    expect(prompt).toContain("Extracted text:");
    expect(prompt).toContain("Page 1:\nHello world");
    expect(prompt).toContain("attached PDF pages 1 through 2");
  });
});

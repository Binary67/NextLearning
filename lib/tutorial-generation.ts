import {
  InvalidAzureOpenAIContentError,
  readAzureOpenAIGenerationConfiguration,
  retryAzureOpenAIGeneration,
} from "@/lib/azure-openai-generation-retry";
import {
  type AzureOpenAIResponse,
  readAzureOpenAIOutputText,
  readAzureOpenAIResponseStream,
} from "@/lib/azure-openai-response";
import {
  documentModelJsonSchema,
  type GeneratedDocumentModel,
  validateGeneratedDocumentModel,
} from "@/lib/document-model";
import type { GeneratedDocumentBatch } from "@/lib/document-batches";

const DOCUMENT_GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

export async function generateDocumentBatch(
  fileData: Buffer,
  fileName: string,
  documentId: string,
  sourcePageCount: number,
  batchIndex: number,
  startPage: number,
  endPage: number,
  inputStartPage: number,
  inputEndPage: number,
): Promise<GeneratedDocumentBatch> {
  const encodedFile = fileData.toString("base64");

  return retryAzureOpenAIGeneration(async () => {
    const outputText = await requestStructuredGeneration([
      {
        type: "input_file",
        filename: fileName,
        file_data: `data:application/pdf;base64,${encodedFile}`,
        detail: "high",
      },
      {
        type: "input_text",
        text: buildDocumentBatchPrompt(
          documentId,
          sourcePageCount,
          startPage,
          endPage,
          inputStartPage,
          inputEndPage,
        ),
      },
    ]);

    try {
      const generatedModel = validateGeneratedBatch(
        JSON.parse(outputText) as unknown,
        documentId,
        sourcePageCount,
        startPage,
        endPage,
      );

      return {
        schema_version: generatedModel.schema_version,
        document_id: documentId,
        batch_index: batchIndex,
        start_page: startPage,
        end_page: endPage,
        title: generatedModel.title,
        summary: generatedModel.pages
          .flatMap((page) => page.chunks.map((chunk) => chunk.summary))
          .join(" "),
        pages: generatedModel.pages.slice(startPage - 1, endPage),
        concepts: generatedModel.concepts,
        connections: generatedModel.connections,
      };
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        "Azure OpenAI returned a document model that could not be grounded in the PDF.",
        error,
      );
    }
  });
}

async function requestStructuredGeneration(content: object[]) {
  const { endpoint, apiKey, deployment } =
    readAzureOpenAIGenerationConfiguration();
  const response = await fetch(`${endpoint}/responses`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deployment,
      store: false,
      stream: true,
      reasoning: {
        effort: "high",
      },
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "document_model",
          schema: documentModelJsonSchema,
          strict: true,
        },
      },
    }),
    signal: AbortSignal.timeout(DOCUMENT_GENERATION_TIMEOUT_MS),
  });
  const fallbackMessage = "Azure OpenAI could not analyze the document.";
  const result = await readAzureOpenAIResponseStream<AzureOpenAIResponse>(
    response,
    fallbackMessage,
  );

  if (result.status !== "completed") {
    throw new Error(`${fallbackMessage} The response did not complete.`);
  }

  return readAzureOpenAIOutputText(
    result,
    "Azure OpenAI declined to analyze the document.",
    "Azure OpenAI returned no document analysis.",
  );
}

function buildDocumentBatchPrompt(
  documentId: string,
  sourcePageCount: number,
  startPage: number,
  endPage: number,
  inputStartPage: number,
  inputEndPage: number,
) {
  return `Create one page batch for an interactive reading tutor.

The attached PDF contains original document pages ${inputStartPage} through ${inputEndPage}. Its first attached page is original PDF page ${inputStartPage}.
Analyze original PDF pages ${startPage} through ${endPage}. Pages outside that owned range are boundary context only. Use them to understand continued sections, paragraphs, figures, and tables, but do not return page records or concept occurrences for context-only pages.

Document rules:
- Set schema_version to 4.
- Set document_id to "${documentId}" exactly.
- Set page_count to ${sourcePageCount} exactly.
- Use 1-based PDF order for page_index.
- Use the printed page number for page_label when visible; otherwise use page_index as a string.
- Create exactly one pages record for each owned original PDF page from ${startPage} through ${endPage}, in order. Return no other pages.
- Give substantive pages between one and 20 chunks in the document's reading order. Use an empty chunks array only when a page contains no instructional content.
- Make each chunk one teaching segment: normally one paragraph, or a few consecutive sentences when a long paragraph contains clearly separable claims. Do not combine independent paragraphs.
- Give each chunk the exact section heading in section_title. Use "Abstract" for an abstract and the nearest enclosing heading when a section continues across pages.
- Copy the segment's source wording from the PDF into source_text. Do not summarize, rewrite, complete, or combine non-consecutive source text. Keep source_text at or below 8000 characters.
- Give chunks globally unique lowercase kebab-case IDs beginning with "chunk:p<page-index>-", concise teaching-focus titles, one-to-three-sentence summaries, and between one and 12 concept_ids.
- Create a separate chunk for an instructional figure, table, or equation when it needs its own explanation. Use its exact caption and nearby introducing text as source_text.
- Do not create chunks for document titles, author lists, affiliations, email addresses, page numbers, running headers, or other publication layout unless that material itself has instructional value.
- Return no more than 200 chunks in this batch.

Concept rules:
- Give each concept a stable lowercase kebab-case ID beginning with "concept:".
- Return no more than 120 concepts and no more than 200 connections in this batch.
- Merge aliases and repeated explanations into one concept.
- Keep definitions short and grounded in this document.
- Give every concept between one and 40 meaningful occurrences.
- Use implicit references sparingly and lower their confidence.
- Record at most one occurrence for a concept on each page.
- Use only concept IDs with an occurrence on that page in each page chunk.

Connection rules:
- Create only pedagogically useful, document-supported connections.
- Make connection direction match the relationship name.
- Give every connection between one and 20 relevant_pages containing the pages that support it.
- Use reason to state briefly why the connection helps explain the document.
- Keep every occurrence and connection confidence between 0 and 1 inclusive.

Do not create learner prompts, assessments, progress, timing, or realtime behavior.`;
}

function validateGeneratedBatch(
  value: unknown,
  documentId: string,
  sourcePageCount: number,
  startPage: number,
  endPage: number,
) {
  if (
    !isRecord(value) ||
    value.page_count !== sourcePageCount ||
    !Array.isArray(value.pages) ||
    value.pages.length !== endPage - startPage + 1 ||
    value.pages.some(
      (page, index) =>
        !isRecord(page) || page.page_index !== startPage + index,
    )
  ) {
    throw new Error("Azure OpenAI returned an invalid document batch.");
  }

  const returnedPages = new Map(
    value.pages.map((page) => [
      (page as { page_index: number }).page_index,
      page,
    ]),
  );
  const pages = Array.from({ length: sourcePageCount }, (_, index) => {
    const pageIndex = index + 1;
    return (
      returnedPages.get(pageIndex) ?? {
        page_index: pageIndex,
        page_label: String(pageIndex),
        chunks: [],
      }
    );
  });

  return validateGeneratedDocumentModel(
    { ...value, pages } as GeneratedDocumentModel,
    documentId,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

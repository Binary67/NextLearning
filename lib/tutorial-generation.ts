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
import { addDocumentHighlightBounds } from "@/lib/document-highlights";

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
      await addDocumentHighlightBounds(
        fileData,
        generatedModel,
        inputStartPage,
      );

      return {
        schema_version: generatedModel.schema_version,
        document_id: documentId,
        batch_index: batchIndex,
        start_page: startPage,
        end_page: endPage,
        title: generatedModel.title,
        pages: generatedModel.pages.slice(startPage - 1, endPage),
        concepts: generatedModel.concepts,
        connections: generatedModel.connections,
      };
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : "";
      throw new InvalidAzureOpenAIContentError(
        `Azure OpenAI returned a document model that could not be grounded in the PDF.${reason}`,
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
- Set schema_version to 5.
- Set document_id to "${documentId}" exactly.
- Set page_count to ${sourcePageCount} exactly.
- Use 1-based PDF order for page_index.
- Use the printed page number for page_label when visible; otherwise use page_index as a string.
- Create exactly one pages record for each owned original PDF page from ${startPage} through ${endPage}, in order. Return no other pages.
- Normally give each substantive page one chunk that teaches its important points together. Use two or three chunks only when the page contains clearly separate headings or unrelated ideas. Use an empty chunks array only when a page contains no instructional content.
- A chunk is a coherent page lesson, not a paragraph. Combine consecutive paragraphs, examples, figures, tables, and equations when they develop the same idea. Preserve detail by covering every important claim, term, reasoning step, and supporting example in the chunk title and summary.
- Give each chunk the exact section heading in section_title. Use "Abstract" for an abstract and the nearest enclosing heading when a section continues across pages.
- Put the chunk's exact source wording in one to four ordered sources. Every source must contain page_index and source_text copied from one PDF page. Do not summarize, rewrite, complete, or combine non-consecutive source text. Use separate sources for distinct non-consecutive spans and keep each source_text at or below 8000 characters.
- Every chunk must have at least one source for its owning page. Multiple sources may use the same page when a coherent lesson needs distinct passages, captions, or equations from that page.
- A chunk may also have sources from the immediately previous page only when a paragraph starts there and continues on the owning page. Put all previous-page sources before all owning-page sources.
- Do not teach an unfinished paragraph on the page where it begins. Assign the complete paragraph to the next page's chunk using the previous-page fragment followed by the owning-page fragment.
- Never use a future page or any non-adjacent page in sources. Pages outside the owned range may be used as a previous-page source only for the first owned page.
- Give chunks globally unique lowercase kebab-case IDs beginning with "chunk:p<page-index>-", concise teaching-focus titles, one-to-three-sentence summaries, and between one and 12 concept_ids.
- Keep an instructional figure, table, or equation with its nearby introducing explanation unless it presents a clearly separate idea.
- Do not create chunks for document titles, author lists, affiliations, email addresses, page numbers, running headers, or other publication layout unless that material itself has instructional value.
- Return no more than 30 chunks in this batch.

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

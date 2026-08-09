import {
  InvalidAzureOpenAIContentError,
  readAzureOpenAIGenerationConfiguration,
  retryAzureOpenAIGeneration,
  retryAzureOpenAIRateLimits,
} from "@/lib/azure-openai-generation-retry";
import {
  type AzureOpenAIResponse,
  readAzureOpenAIOutputText,
  readAzureOpenAIResponseStream,
} from "@/lib/azure-openai-response";
import {
  documentModelJsonSchema,
  type GeneratedDocumentModel,
  validateGeneratedDocumentBatch,
} from "@/lib/document-model";
import type { GroundedGeneratedDocumentBatch } from "@/lib/document-batches";
import { addDocumentHighlightBounds } from "@/lib/document-highlight-orchestration";
import { extractPdfTextRegions } from "@/lib/document-highlight-geometry";
import { buildPageText } from "@/lib/document-highlight-tokens";
import type { PdfTextRegion } from "@/lib/pdf-text-regions";

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
): Promise<GroundedGeneratedDocumentBatch> {
  const encodedFile = fileData.toString("base64");
  const textRegionsByPage = await extractPdfTextRegions(fileData);
  const content = [
    {
      type: "input_file",
      filename: fileName,
      file_data: `data:application/pdf;base64,${encodedFile}`,
      detail:
        process.env.DOCUMENT_VISION_DETAIL === "high" ? "high" : "low",
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
        buildDocumentPageText(textRegionsByPage, inputStartPage),
      ),
    },
  ];

  return retryAzureOpenAIGeneration(async () => {
    const outputText = await retryAzureOpenAIRateLimits(() =>
      requestStructuredGeneration(content),
    );

    try {
      const value = JSON.parse(outputText) as unknown;
      const generatedBatch = validateGeneratedDocumentBatch(value, {
        documentId,
        sourcePageCount,
        batchIndex,
        startPage,
        endPage,
      });
      const grounded = await addDocumentHighlightBounds(
        fileData,
        {
          ...(value as GeneratedDocumentModel),
          pages: generatedBatch.pages,
        },
        inputStartPage,
        textRegionsByPage,
      );

      return {
        ...generatedBatch,
        pages: grounded.pages,
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

export function buildDocumentPageText(
  textRegionsByPage: PdfTextRegion[][],
  inputStartPage: number,
) {
  return textRegionsByPage
    .map((regions, pageOffset) => {
      const pageIndex = inputStartPage + pageOffset;
      return `Page ${pageIndex}:\n${buildPageText(regions)}`;
    })
    .join("\n\n");
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
        effort:
          process.env.DOCUMENT_REASONING_EFFORT === "high"
            ? "high"
            : "low",
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

export function buildDocumentBatchPrompt(
  documentId: string,
  sourcePageCount: number,
  startPage: number,
  endPage: number,
  inputStartPage: number,
  inputEndPage: number,
  pageText: string,
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
- Put the chunk's exact source wording in one to four ordered sources. Every source must contain page_index and source_text copied verbatim from the extracted text at the end of this prompt for one PDF page. Do not summarize, rewrite, complete, or combine non-consecutive source text. Use separate sources for distinct non-consecutive spans and keep each source_text at or below 8000 characters.
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

Do not create learner prompts, assessments, progress, timing, or realtime behavior.

Extracted text:
The text below is the extracted text of attached PDF pages ${inputStartPage} through ${inputEndPage}, in reading order. Every source_text must be copied VERBATIM from this text: copy words, spacing, and punctuation exactly, and do not add, remove, or reorder words. Do not quote the "Page N:" markers or any text outside this extract.

${pageText}`;
}

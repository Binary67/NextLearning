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
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";

export async function generateDocumentModel(
  fileData: Buffer,
  fileName: string,
  documentId: string,
  sourcePageCount: number,
): Promise<DocumentModel> {
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
        text: buildDocumentModelPrompt(documentId, sourcePageCount),
      },
    ]);

    try {
      return validateDocumentModel(
        JSON.parse(outputText) as unknown,
        documentId,
      );
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        "Azure OpenAI returned an invalid document model.",
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

function buildDocumentModelPrompt(
  documentId: string,
  sourcePageCount: number,
) {
  return `Review the complete PDF once, then create a compact document model for an interactive reading tutor.

Document rules:
- Set schema_version to 3.
- Set document_id to "${documentId}" exactly.
- Set page_count to ${sourcePageCount} exactly.
- Use 1-based PDF order for page_index.
- Use the printed page number for page_label when visible; otherwise use page_index as a string.
- Create exactly one pages record for every PDF page in PDF order.
- Give substantive pages between one and 20 chunks in the document's reading order. Use an empty chunks array only when a page contains no instructional content.
- Make each chunk one teaching segment: normally one paragraph, or a few consecutive sentences when a long paragraph contains clearly separable claims. Do not combine independent paragraphs.
- Give each chunk the exact section heading in section_title. Use "Abstract" for an abstract and the nearest enclosing heading when a section continues across pages.
- Copy the segment's source wording from the PDF into source_text. Do not summarize, rewrite, complete, or combine non-consecutive source text. Keep source_text at or below 8000 characters.
- Give chunks globally unique lowercase kebab-case IDs beginning with "chunk:", concise teaching-focus titles, one-to-three-sentence summaries, and between one and 12 concept_ids.
- Create a separate chunk for an instructional figure, table, or equation when it needs its own explanation. Use its exact caption and nearby introducing text as source_text.
- Do not create chunks for document titles, author lists, affiliations, email addresses, page numbers, running headers, or other publication layout unless that material itself has instructional value.
- Return no more than 400 chunks across the document.

Concept rules:
- Give each concept a stable lowercase kebab-case ID beginning with "concept:".
- Return no more than 120 concepts and no more than 400 connections.
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

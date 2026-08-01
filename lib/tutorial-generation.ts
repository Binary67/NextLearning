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
  return `Review the complete PDF once, then create a compact document model for a selection-driven interactive tutor.

Document rules:
- Set schema_version to 2.
- Set document_id to "${documentId}" exactly.
- Set page_count to ${sourcePageCount} exactly.
- Use 1-based PDF order for page_index.
- Use the printed page number for page_label when visible; otherwise use page_index as a string.
- Create exactly one pages record for every PDF page in PDF order.
- Give substantive pages between one and 20 chunks. Use an empty chunks array only for non-instructional pages such as bibliography-only pages or boilerplate.
- Make each chunk one substantial piece of information grounded on that page.
- Give chunks globally unique lowercase kebab-case IDs beginning with "chunk:", concise titles, one-to-three-sentence summaries, and between one and 12 concept_ids.
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

Do not create teaching units, lesson steps, a learning sequence, learner prompts, assessments, progress, timing, or realtime behavior.`;
}

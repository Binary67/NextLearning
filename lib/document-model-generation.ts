import {
  createAzureOpenAIResponseError,
  InvalidAzureOpenAIContentError,
  readAzureOpenAIGenerationConfiguration,
  retryAzureOpenAIGeneration,
} from "@/lib/azure-openai-generation-retry";
import {
  type AzureOpenAIResponse,
  readAzureOpenAIOutputText,
} from "@/lib/azure-openai-response";
import {
  documentModelJsonSchema,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";

export async function generateDocumentModel(
  file: File,
  documentId: string,
): Promise<DocumentModel> {
  const { endpoint, apiKey, deployment } =
    readAzureOpenAIGenerationConfiguration();

  const fileData = Buffer.from(await file.arrayBuffer()).toString("base64");
  return retryAzureOpenAIGeneration(async () => {
    const response = await fetch(`${endpoint}/responses`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deployment,
        store: false,
        reasoning: {
          effort: "high",
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: file.name,
                file_data: `data:application/pdf;base64,${fileData}`,
                detail: "high",
              },
              {
                type: "input_text",
                text: buildDocumentMapPrompt(documentId),
              },
            ],
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
    const result = (await response.json()) as AzureOpenAIResponse;

    if (!response.ok) {
      throw createAzureOpenAIResponseError(
        response.status,
        result.error,
        "Azure OpenAI could not prepare this document.",
      );
    }

    if (result.status !== "completed") {
      throw new Error(
        "Azure OpenAI did not finish preparing this document.",
      );
    }

    const outputText = readAzureOpenAIOutputText(
      result,
      "Azure OpenAI declined to prepare this document.",
      "Azure OpenAI returned no document map.",
    );

    try {
      const documentModel = JSON.parse(outputText) as unknown;
      return validateDocumentModel(documentModel, documentId);
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        "Azure OpenAI returned an invalid document map.",
        error,
      );
    }
  });
}

function buildDocumentMapPrompt(documentId: string) {
  return `Review the complete PDF before producing the document model.

Create a compact concept map for an interactive tutor. Follow these rules:
- Set document_id to "${documentId}" exactly.
- Use 1-based PDF order for page_index.
- Use the printed page number for page_label when visible; otherwise use page_index as a string.
- Give each concept a stable lowercase kebab-case ID beginning with "concept:".
- Return no more than 120 concepts and no more than 400 connections.
- Merge aliases and repeated explanations into one concept.
- Keep definitions short and grounded in this document.
- Give every concept between one and 40 meaningful occurrences. Use implicit references sparingly and lower their confidence.
- Record at most one occurrence for a concept on each page. Choose the most useful teaching role.
- Create only pedagogically useful, document-supported connections.
- Make connection direction match the relationship name.
- Give every connection between one and 20 relevant_pages containing the pages that support it.
- Keep every occurrence and connection confidence between 0 and 1 inclusive.
- Do not generate a learner profile, learning progress, lesson script, quiz, or personalized plan.`;
}

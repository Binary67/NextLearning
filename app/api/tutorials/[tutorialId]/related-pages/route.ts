import { MissingAzureOpenAIConfigurationError } from "@/lib/azure-openai-generation-retry";
import {
  findTextSelectionContext,
  validateDocumentEmbeddings,
} from "@/lib/document-embeddings";
import {
  isTutorialId,
  readDocumentEmbeddings,
} from "@/lib/document-storage";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

type RelatedPagesRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

const MAXIMUM_SELECTION_TEXT_LENGTH = 20_000;

export async function POST(
  request: Request,
  context: RelatedPagesRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  const input = await readRelatedPagesInput(request);

  if (!input) {
    return Response.json(
      { message: "Selected page text is required." },
      { status: 400 },
    );
  }

  try {
    const [prepared, storedEmbeddings] = await Promise.all([
      readPreparedTutorial(tutorialId),
      readDocumentEmbeddings(tutorialId),
    ]);

    if (!prepared || !storedEmbeddings) {
      return tutorialNotFoundResponse();
    }

    if (input.page_index > prepared.model.page_count) {
      return Response.json(
        { message: "The selected page is not available." },
        { status: 400 },
      );
    }

    const embeddings = validateDocumentEmbeddings(
      storedEmbeddings,
      prepared.model,
    );
    const textSelection = await findTextSelectionContext(
      prepared.model,
      embeddings,
      input.page_index,
      input.selection_text,
    );

    return Response.json({ text_selection: textSelection });
  } catch (error) {
    console.error("Related-page matching failed:", error);

    if (error instanceof MissingAzureOpenAIConfigurationError) {
      return Response.json(
        {
          message:
            "Related-page matching is not configured. Check the Azure OpenAI server settings.",
        },
        { status: 503 },
      );
    }

    return Response.json(
      { message: "Related pages are temporarily unavailable." },
      { status: 502 },
    );
  }
}

async function readRelatedPagesInput(request: Request) {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.page_index !== "number" ||
    !Number.isInteger(value.page_index) ||
    value.page_index < 1 ||
    typeof value.selection_text !== "string"
  ) {
    return null;
  }

  const selectionText = value.selection_text.trim();

  if (
    selectionText.length === 0 ||
    selectionText.length > MAXIMUM_SELECTION_TEXT_LENGTH
  ) {
    return null;
  }

  return {
    page_index: value.page_index,
    selection_text: selectionText,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That document is not available." },
    { status: 404 },
  );
}

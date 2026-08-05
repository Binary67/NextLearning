import { MissingAzureOpenAIConfigurationError } from "@/lib/azure-openai-generation-retry";
import {
  findTextSelectionContext,
  validateDocumentEmbeddings,
} from "@/lib/document-embeddings";
import {
  isTutorialId,
  readDocumentEmbeddings,
} from "@/lib/document-storage";
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/request-body-size";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

type RelatedPagesRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

const MAXIMUM_SELECTION_TEXT_LENGTH = 20_000;
const MAXIMUM_REQUEST_BODY_SIZE = 64 * 1024;

export async function POST(
  request: Request,
  context: RelatedPagesRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  let input: Awaited<ReturnType<typeof readRelatedPagesInput>>;

  try {
    input = await readRelatedPagesInput(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { message: "The related-page request is too large." },
        { status: 413 },
      );
    }

    throw error;
  }

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
      request.signal,
    );

    return Response.json({ text_selection: textSelection });
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }

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
  let requestText: string;
  let value: unknown;

  try {
    requestText = await readRequestTextWithLimit(
      request,
      MAXIMUM_REQUEST_BODY_SIZE,
    );
  } catch (error) {
    if (
      error instanceof RequestBodyTooLargeError ||
      request.signal.aborted
    ) {
      throw error;
    }

    return null;
  }

  try {
    value = JSON.parse(requestText);
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

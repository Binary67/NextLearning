import { MissingAzureOpenAIConfigurationError } from "@/lib/azure-openai-generation-retry";
import { findHybridDocumentTopics } from "@/lib/document-search";
import { validateDocumentEmbeddings } from "@/lib/document-embedding-validation";
import { readDocumentEmbeddings } from "@/lib/document-artifact-storage";
import { isTutorialId } from "@/lib/tutorial-storage";
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/request-body-size";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

const MAXIMUM_REQUEST_BODY_SIZE = 8 * 1024;
const MAXIMUM_QUERY_LENGTH = 1_000;
type TopicRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function POST(
  request: Request,
  context: TopicRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  let input: { query: string } | null;

  try {
    input = await readInput(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { message: "The topic search request is too large." },
        { status: 413 },
      );
    }

    throw error;
  }

  if (!input) {
    return Response.json(
      { message: "A document topic query is required." },
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

    const embeddings = validateDocumentEmbeddings(
      storedEmbeddings,
      prepared.model,
    );
    const matches = await findHybridDocumentTopics(
      prepared.model,
      embeddings,
      input.query,
      request.signal,
    );

    return Response.json({ matches });
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }

    console.error("Document topic search failed:", error);

    if (error instanceof MissingAzureOpenAIConfigurationError) {
      return Response.json(
        {
          message:
            "Document topic search is not configured. Check the Azure OpenAI server settings.",
        },
        { status: 503 },
      );
    }

    return Response.json(
      { message: "Document topic search is temporarily unavailable." },
      { status: 502 },
    );
  }
}

async function readInput(request: Request) {
  const text = await readRequestTextWithLimit(
    request,
    MAXIMUM_REQUEST_BODY_SIZE,
  );
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("query" in value) ||
    typeof value.query !== "string"
  ) {
    return null;
  }

  const query = value.query.trim();

  return query && query.length <= MAXIMUM_QUERY_LENGTH
    ? { query }
    : null;
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That document is not available." },
    { status: 404 },
  );
}

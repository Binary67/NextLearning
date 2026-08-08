import { MissingAzureOpenAIConfigurationError } from "@/lib/azure-openai-generation-retry";
import { isTutorialId } from "@/lib/document-storage";
import {
  generateLearningVisual,
  LearningVisualInputError,
  MAX_LEARNING_VISUAL_REQUEST_BYTES,
  parseLearningVisualGenerationInput,
} from "@/lib/learning-visual";
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/request-body-size";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

type LearningVisualsRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function POST(
  request: Request,
  context: LearningVisualsRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  let value: unknown;

  try {
    const requestText = await readRequestTextWithLimit(
      request,
      MAX_LEARNING_VISUAL_REQUEST_BYTES,
    );
    value = JSON.parse(requestText) as unknown;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { message: "The learning-visual request is too large." },
        { status: 413 },
      );
    }

    return invalidInputResponse();
  }

  try {
    const input = parseLearningVisualGenerationInput(value);
    const prepared = await readPreparedTutorial(tutorialId);

    if (!prepared) {
      return tutorialNotFoundResponse();
    }

    const visual = await generateLearningVisual(
      prepared.model,
      input,
      request.signal,
    );
    return Response.json(visual);
  } catch (error) {
    if (error instanceof LearningVisualInputError) {
      return Response.json({ message: error.message }, { status: 400 });
    }

    if (request.signal.aborted) {
      throw error;
    }

    if (error instanceof MissingAzureOpenAIConfigurationError) {
      return Response.json(
        {
          message:
            "Learning-visual generation is not configured. Check the Azure OpenAI server settings.",
        },
        { status: 503 },
      );
    }

    console.error("Learning-visual generation failed:", error);
    return Response.json(
      { message: "The learning visual could not be generated." },
      { status: 502 },
    );
  }
}

function invalidInputResponse() {
  return Response.json(
    { message: "A valid learning-visual request is required." },
    { status: 400 },
  );
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That document is not available." },
    { status: 404 },
  );
}

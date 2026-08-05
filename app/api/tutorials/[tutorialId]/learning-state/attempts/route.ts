import { isTutorialId } from "@/lib/document-storage";
import {
  LearningStateConflictError,
  LearningStateInputError,
  parseLearningAttemptInput,
  recordLearningAttempt,
  validateAttemptReferences,
} from "@/lib/learning-state";
import { mutateLearningState } from "@/lib/learning-state-store";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

type LearningAttemptRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function POST(
  request: Request,
  context: LearningAttemptRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  try {
    const prepared = await readPreparedTutorial(tutorialId);

    if (!prepared) {
      return tutorialNotFoundResponse();
    }

    const input = parseLearningAttemptInput(await readJson(request));
    validateAttemptReferences(input, prepared.model);
    const learningState = await mutateLearningState(
      tutorialId,
      prepared.model,
      (state, now) => recordLearningAttempt(state, input, now),
    );

    return Response.json({ learningState });
  } catch (error) {
    if (error instanceof LearningStateInputError) {
      return Response.json(
        { message: error.message },
        { status: 400 },
      );
    }

    if (error instanceof LearningStateConflictError) {
      return Response.json(
        { message: error.message },
        { status: 409 },
      );
    }

    console.error("Learning-attempt persistence failed:", error);
    return Response.json(
      { message: "The learning state could not be saved." },
      { status: 500 },
    );
  }
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new LearningStateInputError("A JSON body is required.");
  }
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That document is not available." },
    { status: 404 },
  );
}

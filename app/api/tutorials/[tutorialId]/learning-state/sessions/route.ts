import { isTutorialId } from "@/lib/document-storage";
import {
  LearningStateInputError,
  parseLearningSessionInput,
  recordLearningSession,
  validateSessionReferences,
} from "@/lib/learning-state";
import { mutateLearningState } from "@/lib/learning-state-store";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

type LearningSessionRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function POST(
  request: Request,
  context: LearningSessionRouteContext,
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

    const input = parseLearningSessionInput(await readJson(request));
    validateSessionReferences(input, prepared.model);
    const learningState = await mutateLearningState(
      tutorialId,
      prepared.model,
      (state, now) => recordLearningSession(state, input, now),
    );

    return Response.json({ learningState });
  } catch (error) {
    if (error instanceof LearningStateInputError) {
      return Response.json(
        { message: error.message },
        { status: 400 },
      );
    }

    console.error("Learning-session persistence failed:", error);
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

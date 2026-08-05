import { isTutorialId } from "@/lib/document-storage";
import {
  LearningStateConflictError,
  LearningStateInputError,
  parseResumeInput,
  updateResume,
  validateResumeReferences,
} from "@/lib/learning-state";
import {
  mutateLearningState,
  readLearningState,
} from "@/lib/learning-state-store";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

type LearningStateRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function GET(
  _request: Request,
  context: LearningStateRouteContext,
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

    const learningState = await readLearningState(
      tutorialId,
      prepared.model,
    );

    return Response.json({ learningState });
  } catch (error) {
    return learningStateErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: LearningStateRouteContext,
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

    const resume = parseResumeInput(await readJson(request));
    validateResumeReferences(resume, prepared.model);
    const learningState = await mutateLearningState(
      tutorialId,
      prepared.model,
      (state, now) => updateResume(state, resume, now),
    );

    return Response.json({ learningState });
  } catch (error) {
    return learningStateErrorResponse(error);
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

function learningStateErrorResponse(error: unknown) {
  if (error instanceof LearningStateInputError) {
    return Response.json({ message: error.message }, { status: 400 });
  }

  if (error instanceof LearningStateConflictError) {
    return Response.json({ message: error.message }, { status: 409 });
  }

  console.error("Learning-state persistence failed:", error);
  return Response.json(
    { message: "The learning state could not be saved." },
    { status: 500 },
  );
}

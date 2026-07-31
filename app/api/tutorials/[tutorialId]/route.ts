import {
  deleteStoredTutorial,
  isTutorialId,
} from "@/lib/document-storage";
import {
  readPreparedTutorial,
  toTutorialResponse,
} from "@/lib/tutorial";

export const runtime = "nodejs";

type TutorialRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function GET(
  _request: Request,
  context: TutorialRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  const prepared = await readPreparedTutorial(tutorialId);

  if (!prepared) {
    return tutorialNotFoundResponse();
  }

  return Response.json({
    tutorial: toTutorialResponse(prepared),
    model: prepared.model,
    layout: prepared.layout,
    plan: prepared.plan,
    grounding: prepared.grounding,
    progress: prepared.progress,
  });
}

export async function DELETE(
  _request: Request,
  context: TutorialRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  const deleted = await deleteStoredTutorial(tutorialId);

  if (!deleted) {
    return tutorialNotFoundResponse();
  }

  return Response.json({ deleted: true });
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That tutorial is not available." },
    { status: 404 },
  );
}

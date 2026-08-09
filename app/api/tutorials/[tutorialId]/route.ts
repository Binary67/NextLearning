import { after } from "next/server";

import {
  deleteStoredTutorial,
  isTutorialId,
  readStoredTutorial,
  updateStoredTutorial,
} from "@/lib/tutorial-storage";
import {
  readAvailableTutorial,
  toTutorialResponse,
} from "@/lib/tutorial";
import { runTutorialQueue } from "@/lib/tutorial-queue";

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

  const available = await readAvailableTutorial(tutorialId);

  if (!available) {
    return tutorialNotFoundResponse();
  }

  return Response.json({
    tutorial: toTutorialResponse(available.tutorial, available.model),
    model: available.model,
  });
}

export async function PATCH(
  _request: Request,
  context: TutorialRouteContext,
) {
  const { tutorialId } = await context.params;
  const tutorial = isTutorialId(tutorialId)
    ? await readStoredTutorial(tutorialId)
    : null;

  if (!tutorial) {
    return tutorialNotFoundResponse();
  }

  if (tutorial.status !== "failed") {
    return Response.json(
      { message: "Only failed documents can be retried." },
      { status: 409 },
    );
  }

  const queuedTutorial = await updateStoredTutorial(tutorial, {
    status: "queued",
    error: null,
  });
  after(runTutorialQueue);

  return Response.json({
    tutorial: toTutorialResponse(queuedTutorial),
  });
}

export async function DELETE(
  _request: Request,
  context: TutorialRouteContext,
) {
  const { tutorialId } = await context.params;

  const tutorial = isTutorialId(tutorialId)
    ? await readStoredTutorial(tutorialId)
    : null;

  if (!tutorial) {
    return tutorialNotFoundResponse();
  }

  if (
    tutorial.status === "queued" ||
    tutorial.status === "processing"
  ) {
    return Response.json(
      { message: "A document cannot be deleted while it is being prepared." },
      { status: 409 },
    );
  }

  const deleted = await deleteStoredTutorial(tutorialId);

  if (!deleted) {
    return tutorialNotFoundResponse();
  }

  return Response.json({ deleted: true });
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That document is not available." },
    { status: 404 },
  );
}

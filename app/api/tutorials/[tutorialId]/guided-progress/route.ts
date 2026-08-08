import {
  type GuidedProgressEvent,
} from "@/lib/guided-progress";
import {
  readGuidedProgress,
  recordGuidedProgressEvent,
  resetGuidedProgress,
} from "@/lib/guided-progress-store";
import { isTutorialId } from "@/lib/document-storage";
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/request-body-size";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

const MAX_EVENT_BYTES = 100 * 1024;

type GuidedProgressRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function GET(
  _request: Request,
  context: GuidedProgressRouteContext,
) {
  const { tutorialId } = await context.params;
  const prepared = isTutorialId(tutorialId)
    ? await readPreparedTutorial(tutorialId)
    : null;

  if (!prepared) {
    return tutorialNotFoundResponse();
  }

  return Response.json({
    guidedProgress: await readGuidedProgress(
      tutorialId,
      prepared.model,
    ),
  });
}

export async function POST(
  request: Request,
  context: GuidedProgressRouteContext,
) {
  const { tutorialId } = await context.params;
  const prepared = isTutorialId(tutorialId)
    ? await readPreparedTutorial(tutorialId)
    : null;

  if (!prepared) {
    return tutorialNotFoundResponse();
  }

  let event: GuidedProgressEvent | null;

  try {
    event = await readEvent(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { message: "The guided-progress event is too large." },
        { status: 413 },
      );
    }

    throw error;
  }

  if (!event) {
    return Response.json(
      { message: "A valid guided-reading progress event is required." },
      { status: 400 },
    );
  }

  try {
    const guidedProgress = await recordGuidedProgressEvent(
      tutorialId,
      prepared.model,
      event,
    );
    return Response.json({ guidedProgress });
  } catch (error) {
    console.error("Guided-reading progress could not be saved:", error);
    return Response.json(
      { message: "Your guided-reading progress could not be saved." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: GuidedProgressRouteContext,
) {
  const { tutorialId } = await context.params;
  const prepared = isTutorialId(tutorialId)
    ? await readPreparedTutorial(tutorialId)
    : null;

  if (!prepared) {
    return tutorialNotFoundResponse();
  }

  try {
    const guidedProgress = await resetGuidedProgress(tutorialId);
    return Response.json({ guidedProgress });
  } catch (error) {
    console.error("Guided-reading progress could not be reset:", error);
    return Response.json(
      { message: "Your guided-reading progress could not be reset." },
      { status: 500 },
    );
  }
}

async function readEvent(
  request: Request,
): Promise<GuidedProgressEvent | null> {
  let value: unknown;

  try {
    const requestText = await readRequestTextWithLimit(
      request,
      MAX_EVENT_BYTES,
    );
    value = JSON.parse(requestText) as unknown;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw error;
    }

    return null;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    !("pageIndex" in value) ||
    typeof value.type !== "string" ||
    typeof value.pageIndex !== "number" ||
    !Number.isInteger(value.pageIndex)
  ) {
    return null;
  }

  if (value.type === "empty_page_completed") {
    return {
      type: value.type,
      pageIndex: value.pageIndex,
    };
  }

  if (
    (value.type === "segment_started" ||
      value.type === "segment_completed") &&
    "chunkId" in value &&
    typeof value.chunkId === "string"
  ) {
    return {
      type: value.type,
      pageIndex: value.pageIndex,
      chunkId: value.chunkId,
    };
  }

  return null;
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That document is not available." },
    { status: 404 },
  );
}

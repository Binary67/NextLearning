import { isTutorialId, saveLearningProgress } from "@/lib/document-storage";
import {
  createLearningProgress,
  findActiveTeachingUnit,
  markUnitMastered,
} from "@/lib/learning-progress";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

type TutorialProgressRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function GET(
  _request: Request,
  context: TutorialProgressRouteContext,
) {
  const prepared = await readTutorialFromContext(context);

  if (!prepared) {
    return tutorialNotFoundResponse();
  }

  return Response.json({
    progress: prepared.progress,
    active_unit_id:
      findActiveTeachingUnit(prepared.plan, prepared.progress)?.id ?? null,
  });
}

export async function PUT(
  _request: Request,
  context: TutorialProgressRouteContext,
) {
  const prepared = await readTutorialFromContext(context);

  if (!prepared) {
    return tutorialNotFoundResponse();
  }

  const progress = createLearningProgress(prepared.progress.document_id);
  await saveLearningProgress(prepared.tutorial.id, progress);

  return Response.json({ progress });
}

export async function POST(
  request: Request,
  context: TutorialProgressRouteContext,
) {
  const prepared = await readTutorialFromContext(context);

  if (!prepared) {
    return tutorialNotFoundResponse();
  }

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isRecord(body)) {
    return Response.json(
      { message: "Provide mastery evidence for the active unit." },
      { status: 400 },
    );
  }

  const activeUnit = findActiveTeachingUnit(
    prepared.plan,
    prepared.progress,
  );

  if (!activeUnit) {
    return Response.json(
      { message: "Every teaching unit is already mastered." },
      { status: 409 },
    );
  }

  if (body.active_unit_id !== activeUnit.id) {
    return Response.json(
      { message: "The active teaching unit has changed." },
      { status: 409 },
    );
  }

  if (
    typeof body.mastery_evidence !== "string" ||
    body.mastery_evidence.trim().length === 0 ||
    body.mastery_evidence.length > 2000
  ) {
    return Response.json(
      { message: "Provide concise mastery evidence." },
      { status: 400 },
    );
  }

  const progress = markUnitMastered(
    prepared.progress,
    activeUnit,
    body.mastery_evidence,
  );
  await saveLearningProgress(prepared.tutorial.id, progress);

  return Response.json({
    progress,
    completed_unit_id: activeUnit.id,
    active_unit_id:
      findActiveTeachingUnit(prepared.plan, progress)?.id ?? null,
  });
}

async function readTutorialFromContext(
  context: TutorialProgressRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return null;
  }

  return readPreparedTutorial(tutorialId);
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That tutorial is not available." },
    { status: 404 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

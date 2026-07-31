import { validateDocumentModel } from "@/lib/document-model";
import {
  readDocumentModel,
  readLearningProgress,
  readStoredDocument,
  readTeachingPlan,
  saveLearningProgress,
} from "@/lib/document-storage";
import {
  createLearningProgress,
  findActiveTeachingUnit,
  markUnitMastered,
  validateLearningProgress,
} from "@/lib/learning-progress";
import { validateTeachingPlan } from "@/lib/teaching-plan";

export const runtime = "nodejs";

export async function GET() {
  const prepared = await readPreparedTutorial();

  if (!prepared) {
    return Response.json(
      { message: "No prepared tutorial is available." },
      { status: 404 },
    );
  }

  return Response.json({
    progress: prepared.progress,
    active_unit_id:
      findActiveTeachingUnit(prepared.plan, prepared.progress)?.id ?? null,
  });
}

export async function PUT() {
  const prepared = await readPreparedTutorial();

  if (!prepared) {
    return Response.json(
      { message: "No prepared tutorial is available." },
      { status: 404 },
    );
  }

  const progress = createLearningProgress(prepared.progress.document_id);
  await saveLearningProgress(progress);

  return Response.json({ progress });
}

export async function POST(request: Request) {
  const prepared = await readPreparedTutorial();

  if (!prepared) {
    return Response.json(
      { message: "No prepared tutorial is available." },
      { status: 404 },
    );
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
  await saveLearningProgress(progress);

  return Response.json({
    progress,
    completed_unit_id: activeUnit.id,
    active_unit_id:
      findActiveTeachingUnit(prepared.plan, progress)?.id ?? null,
  });
}

async function readPreparedTutorial() {
  const [document, storedModel, storedPlan, storedProgress] =
    await Promise.all([
      readStoredDocument(),
      readDocumentModel(),
      readTeachingPlan(),
      readLearningProgress(),
    ]);

  if (!document || !storedModel || !storedPlan || !storedProgress) {
    return null;
  }

  const model = validateDocumentModel(storedModel, document.id);
  const plan = validateTeachingPlan(storedPlan, model);
  const progress = validateLearningProgress(
    storedProgress,
    document.id,
    plan,
  );

  return { plan, progress };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

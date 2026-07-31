import { validateDocumentModel } from "@/lib/document-model";
import {
  readDocumentModel,
  readStoredDocument,
  readTeachingPlan,
} from "@/lib/document-storage";
import { validateTeachingPlan } from "@/lib/teaching-plan";

export const runtime = "nodejs";

export async function GET() {
  const [document, storedModel, storedPlan] = await Promise.all([
    readStoredDocument(),
    readDocumentModel(),
    readTeachingPlan(),
  ]);

  if (!document || !storedModel || !storedPlan) {
    return Response.json(
      { message: "No prepared teaching plan is available." },
      { status: 404 },
    );
  }

  const model = validateDocumentModel(storedModel, document.id);

  return Response.json({
    plan: validateTeachingPlan(storedPlan, model),
  });
}

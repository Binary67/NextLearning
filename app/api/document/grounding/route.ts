import { validateDocumentLayout } from "@/lib/document-layout";
import { validateDocumentModel } from "@/lib/document-model";
import {
  readDocumentLayout,
  readDocumentModel,
  readStoredDocument,
  readTeachingGrounding,
  readTeachingPlan,
} from "@/lib/document-storage";
import { validateTeachingGrounding } from "@/lib/teaching-grounding";
import { validateTeachingPlan } from "@/lib/teaching-plan";

export const runtime = "nodejs";

export async function GET() {
  const [
    document,
    storedModel,
    storedLayout,
    storedPlan,
    storedGrounding,
  ] = await Promise.all([
    readStoredDocument(),
    readDocumentModel(),
    readDocumentLayout(),
    readTeachingPlan(),
    readTeachingGrounding(),
  ]);

  if (
    !document ||
    !storedModel ||
    !storedLayout ||
    !storedPlan ||
    !storedGrounding
  ) {
    return Response.json(
      { message: "No prepared teaching grounding is available." },
      { status: 404 },
    );
  }

  const model = validateDocumentModel(storedModel, document.id);
  const layout = validateDocumentLayout(
    storedLayout,
    document.id,
    model.page_count,
  );
  const plan = validateTeachingPlan(storedPlan, model);

  return Response.json({
    grounding: validateTeachingGrounding(
      storedGrounding,
      plan,
      layout,
    ),
  });
}

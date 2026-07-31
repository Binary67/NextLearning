import { validateDocumentLayout } from "@/lib/document-layout";
import { validateDocumentModel } from "@/lib/document-model";
import {
  readDocumentLayout,
  readDocumentModel,
  readStoredDocument,
} from "@/lib/document-storage";

export const runtime = "nodejs";

export async function GET() {
  const [document, storedModel, storedLayout] = await Promise.all([
    readStoredDocument(),
    readDocumentModel(),
    readDocumentLayout(),
  ]);

  if (!document || !storedModel || !storedLayout) {
    return Response.json(
      { message: "No prepared document layout is available." },
      { status: 404 },
    );
  }

  const model = validateDocumentModel(storedModel, document.id);

  return Response.json({
    layout: validateDocumentLayout(
      storedLayout,
      document.id,
      model.page_count,
    ),
  });
}

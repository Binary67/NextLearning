import { validateDocumentModel } from "@/lib/document-model";
import {
  readDocumentModel,
  readStoredDocument,
} from "@/lib/document-storage";

export const runtime = "nodejs";

export async function GET() {
  const [document, storedModel] = await Promise.all([
    readStoredDocument(),
    readDocumentModel(),
  ]);

  if (!document || !storedModel) {
    return Response.json(
      { message: "No prepared document is available." },
      { status: 404 },
    );
  }

  return Response.json({
    model: validateDocumentModel(storedModel, document.id),
  });
}

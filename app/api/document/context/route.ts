import {
  buildPageLearningContext,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  readDocumentModel,
  readStoredDocument,
} from "@/lib/document-storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const pageIndex = Number(new URL(request.url).searchParams.get("page"));

  if (!Number.isInteger(pageIndex) || pageIndex < 1) {
    return Response.json(
      { message: "Provide a valid 1-based page number." },
      { status: 400 },
    );
  }

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

  const model = validateDocumentModel(storedModel, document.id);

  if (pageIndex > model.page_count) {
    return Response.json(
      { message: `This document has ${model.page_count} pages.` },
      { status: 400 },
    );
  }

  return Response.json({
    context: buildPageLearningContext(model, pageIndex),
  });
}

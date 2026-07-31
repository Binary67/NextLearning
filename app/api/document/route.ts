import { randomUUID } from "node:crypto";

import {
  MissingAzureOpenAIConfigurationError,
  generateDocumentModel,
} from "@/lib/document-model-generation";
import { generateDocumentLayout } from "@/lib/document-layout-generation";
import { validateDocumentLayout } from "@/lib/document-layout";
import {
  summarizeDocumentModel,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  deleteStoredDocument,
  MAX_DOCUMENT_SIZE,
  readDocumentLayout,
  readDocumentModel,
  readStoredDocument,
  readTeachingGrounding,
  readTeachingPlan,
  saveDocument,
  type StoredDocument,
} from "@/lib/document-storage";
import { generateTeachingGrounding } from "@/lib/teaching-grounding-generation";
import { validateTeachingGrounding } from "@/lib/teaching-grounding";
import { generateTeachingPlan } from "@/lib/teaching-plan-generation";
import {
  summarizeTeachingPlan,
  type TeachingPlan,
  validateTeachingPlan,
} from "@/lib/teaching-plan";

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
    return Response.json({ document: null });
  }

  const model = validateDocumentModel(storedModel, document.id);
  const layout = validateDocumentLayout(
    storedLayout,
    document.id,
    model.page_count,
  );
  const plan = validateTeachingPlan(storedPlan, model);
  validateTeachingGrounding(storedGrounding, plan, layout);

  return Response.json({
    document: toDocumentResponse(document, model, plan),
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { message: "Choose a PDF file to upload." },
      { status: 400 },
    );
  }

  if (!isPdf(file)) {
    return Response.json(
      { message: "Only PDF files are supported." },
      { status: 415 },
    );
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    return Response.json(
      { message: "The document must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  const documentId = randomUUID();

  try {
    const [model, generatedLayout] = await Promise.all([
      generateDocumentModel(file, documentId),
      generateDocumentLayout(file, documentId),
    ]);
    const layout = validateDocumentLayout(
      generatedLayout,
      documentId,
      model.page_count,
    );
    const plan = await generateTeachingPlan(file, model);
    const grounding = await generateTeachingGrounding(
      model,
      plan,
      layout,
    );
    const document = await saveDocument(
      file,
      documentId,
      model,
      plan,
      layout,
      grounding,
    );

    return Response.json({
      document: toDocumentResponse(document, model, plan),
    });
  } catch (error) {
    console.error("Document preparation failed:", error);

    if (error instanceof MissingAzureOpenAIConfigurationError) {
      return Response.json(
        {
          message:
            "Document preparation is not configured. Check the Azure OpenAI server settings.",
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        message: "The document could not be prepared. Try again.",
      },
      { status: 502 },
    );
  }
}

export async function DELETE() {
  const deleted = await deleteStoredDocument();

  return Response.json({ deleted });
}

function isPdf(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension === "pdf" && file.type === "application/pdf";
}

function toDocumentResponse(
  document: StoredDocument,
  model: DocumentModel,
  plan: TeachingPlan,
) {
  return {
    id: document.id,
    name: document.name,
    type: document.type,
    url: "/api/document/file",
    map: summarizeDocumentModel(model),
    plan: summarizeTeachingPlan(plan),
  };
}

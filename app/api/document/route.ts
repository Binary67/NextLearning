import { randomUUID } from "node:crypto";

import {
  MissingAzureOpenAIConfigurationError,
  generateDocumentModel,
} from "@/lib/document-model-generation";
import {
  summarizeDocumentModel,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  deleteStoredDocument,
  MAX_DOCUMENT_SIZE,
  readDocumentModel,
  readStoredDocument,
  readTeachingPlan,
  saveDocument,
  type StoredDocument,
} from "@/lib/document-storage";
import { generateTeachingPlan } from "@/lib/teaching-plan-generation";
import {
  summarizeTeachingPlan,
  type TeachingPlan,
  validateTeachingPlan,
} from "@/lib/teaching-plan";

export const runtime = "nodejs";

export async function GET() {
  const [document, storedModel, storedPlan] = await Promise.all([
    readStoredDocument(),
    readDocumentModel(),
    readTeachingPlan(),
  ]);

  if (!document || !storedModel || !storedPlan) {
    return Response.json({ document: null });
  }

  const model = validateDocumentModel(storedModel, document.id);
  const plan = validateTeachingPlan(storedPlan, model);

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
    const model = await generateDocumentModel(file, documentId);
    const plan = await generateTeachingPlan(file, model);
    const document = await saveDocument(file, documentId, model, plan);

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

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

type DocumentPreparationEvent =
  | {
      type: "progress";
      stage: "analyzing" | "planning" | "grounding" | "saving";
    }
  | {
      type: "complete";
      document: ReturnType<typeof toDocumentResponse>;
    }
  | {
      type: "error";
      message: string;
    };

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: DocumentPreparationEvent) => {
        controller.enqueue(
          encoder.encode(`${JSON.stringify(event)}\n`),
        );
      };

      try {
        send({ type: "progress", stage: "analyzing" });
        const [model, generatedLayout] = await Promise.all([
          generateDocumentModel(file, documentId),
          generateDocumentLayout(file, documentId),
        ]);
        const layout = validateDocumentLayout(
          generatedLayout,
          documentId,
          model.page_count,
        );

        send({ type: "progress", stage: "planning" });
        const plan = await generateTeachingPlan(file, model);

        send({ type: "progress", stage: "grounding" });
        const grounding = await generateTeachingGrounding(
          model,
          plan,
          layout,
        );

        send({ type: "progress", stage: "saving" });
        const document = await saveDocument(
          file,
          documentId,
          model,
          plan,
          layout,
          grounding,
        );

        send({
          type: "complete",
          document: toDocumentResponse(document, model, plan),
        });
      } catch (error) {
        console.error("Document preparation failed:", error);
        send({
          type: "error",
          message:
            error instanceof MissingAzureOpenAIConfigurationError
              ? "Document preparation is not configured. Check the server settings."
              : "The document could not be prepared. Try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
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

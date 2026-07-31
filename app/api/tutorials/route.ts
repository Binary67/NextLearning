import { randomUUID } from "node:crypto";

import { MissingAzureOpenAIConfigurationError } from "@/lib/azure-openai-generation-retry";
import { generateDocumentModel } from "@/lib/document-model-generation";
import { generateDocumentLayout } from "@/lib/document-layout-generation";
import { validateDocumentLayout } from "@/lib/document-layout";
import {
  MAX_DOCUMENT_SIZE,
  saveTutorial,
} from "@/lib/document-storage";
import { createLearningProgress } from "@/lib/learning-progress";
import { generateTeachingGrounding } from "@/lib/teaching-grounding-generation";
import { generateTeachingPlan } from "@/lib/teaching-plan-generation";
import {
  listPreparedTutorials,
  type TutorialResponse,
  toTutorialResponse,
} from "@/lib/tutorial";

export const runtime = "nodejs";

type DocumentPreparationEvent =
  | {
      type: "progress";
      stage: "analyzing" | "planning" | "grounding" | "saving";
    }
  | {
      type: "complete";
      tutorial: TutorialResponse;
    }
  | {
      type: "error";
      message: string;
    };

export async function GET() {
  const tutorials = await listPreparedTutorials();

  return Response.json({
    tutorials: tutorials.map(toTutorialResponse),
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

  const tutorialId = randomUUID();

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
          generateDocumentModel(file, tutorialId),
          generateDocumentLayout(file, tutorialId),
        ]);
        const layout = validateDocumentLayout(
          generatedLayout,
          tutorialId,
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
        const tutorial = await saveTutorial(
          file,
          tutorialId,
          model,
          plan,
          layout,
          grounding,
        );

        send({
          type: "complete",
          tutorial: toTutorialResponse({
            tutorial,
            model,
            plan,
            progress: createLearningProgress(tutorialId, tutorial.createdAt),
          }),
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

function isPdf(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension === "pdf" && file.type === "application/pdf";
}

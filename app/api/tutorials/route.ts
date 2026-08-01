import { randomUUID } from "node:crypto";

import { MissingAzureOpenAIConfigurationError } from "@/lib/azure-openai-generation-retry";
import { generateDocumentEmbeddings } from "@/lib/document-embeddings";
import {
  MAX_DOCUMENT_SIZE,
  saveTutorial,
} from "@/lib/document-storage";
import { readPdfPageCount } from "@/lib/pdf-document-metadata";
import {
  listPreparedTutorials,
  toTutorialResponse,
  type TutorialResponse,
} from "@/lib/tutorial";
import { generateDocumentModel } from "@/lib/tutorial-generation";

export const runtime = "nodejs";

type TutorialPreparationEvent =
  | {
      type: "progress";
      stage: "analyzing" | "saving";
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
  const fileData = Buffer.from(await file.arrayBuffer());
  let sourcePageCount: number;

  try {
    sourcePageCount = await readPdfPageCount(fileData);
  } catch (error) {
    console.error("PDF validation failed:", error);
    return Response.json(
      { message: "The PDF could not be read." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: TutorialPreparationEvent) => {
        controller.enqueue(
          encoder.encode(`${JSON.stringify(event)}\n`),
        );
      };

      try {
        send({ type: "progress", stage: "analyzing" });
        const model = await generateDocumentModel(
          fileData,
          file.name,
          tutorialId,
          sourcePageCount,
        );
        const embeddings = await generateDocumentEmbeddings(model);

        send({ type: "progress", stage: "saving" });
        const tutorial = await saveTutorial(
          file.name,
          fileData,
          tutorialId,
          model,
          embeddings,
        );

        send({
          type: "complete",
          tutorial: toTutorialResponse({ tutorial, model }),
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

import { randomUUID } from "node:crypto";
import { after } from "next/server";

import {
  createQueuedTutorial,
  MAX_DOCUMENT_SIZE,
} from "@/lib/document-storage";
import { readPdfPageCount } from "@/lib/pdf-document-metadata";
import {
  listTutorials,
  toTutorialResponse,
} from "@/lib/tutorial";
import { hasActiveTutorials } from "@/lib/tutorial-status";
import { runTutorialQueue } from "@/lib/tutorial-queue";

export const runtime = "nodejs";

export async function GET() {
  const tutorials = await listTutorials();

  if (hasActiveTutorials(tutorials)) {
    after(runTutorialQueue);
  }

  return Response.json({ tutorials });
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

  const tutorial = await createQueuedTutorial(
    file.name,
    fileData,
    tutorialId,
    sourcePageCount,
  );
  after(runTutorialQueue);

  return Response.json(
    { tutorial: toTutorialResponse(tutorial) },
    { status: 202 },
  );
}

function isPdf(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension === "pdf" && file.type === "application/pdf";
}

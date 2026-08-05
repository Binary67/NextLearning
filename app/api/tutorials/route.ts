import { randomUUID } from "node:crypto";
import { after } from "next/server";

import {
  createQueuedTutorial,
  MAX_DOCUMENT_SIZE,
} from "@/lib/document-storage";
import { readPdfPageCount } from "@/lib/pdf-document-metadata";
import {
  isContentLengthOverLimit,
  isMultipartFormDataContentType,
  readRequestBytesWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/request-body-size";
import {
  listTutorials,
  toTutorialResponse,
} from "@/lib/tutorial";
import { hasActiveTutorials } from "@/lib/tutorial-status";
import { runTutorialQueue } from "@/lib/tutorial-queue";

export const runtime = "nodejs";

const MAX_MULTIPART_REQUEST_SIZE = 11 * 1024 * 1024;

export async function GET() {
  const tutorials = await listTutorials();

  if (hasActiveTutorials(tutorials)) {
    after(runTutorialQueue);
  }

  return Response.json({ tutorials });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");

  if (!isMultipartFormDataContentType(contentType)) {
    return Response.json(
      { message: "The upload must use multipart form data." },
      { status: 415 },
    );
  }

  if (
    isContentLengthOverLimit(
      request.headers.get("content-length"),
      MAX_MULTIPART_REQUEST_SIZE,
    )
  ) {
    return Response.json(
      { message: "The document must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  let requestBytes: Uint8Array;

  try {
    requestBytes = await readRequestBytesWithLimit(
      request,
      MAX_MULTIPART_REQUEST_SIZE,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { message: "The document must be 10 MB or smaller." },
        { status: 413 },
      );
    }

    throw error;
  }

  const formData = await new Response(
    new Uint8Array(requestBytes),
    {
      headers: {
        "Content-Type": contentType!,
      },
    },
  ).formData();
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

import { randomUUID } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { after } from "next/server";

import { MAX_DOCUMENT_SIZE } from "@/lib/document-artifact-storage";
import type { StoredTutorial } from "@/lib/document-storage-types";
import {
  documentFileName,
  tutorialDirectory,
  tutorialFilePath,
} from "@/lib/document-storage-paths";
import { readPdfPageCount } from "@/lib/pdf-document-metadata";
import {
  isContentLengthOverLimit,
} from "@/lib/request-body-size";
import {
  listTutorials,
  toTutorialResponse,
} from "@/lib/tutorial";
import { hasActiveTutorials } from "@/lib/tutorial-status";
import { runTutorialQueue } from "@/lib/tutorial-queue";
import { createQueuedTutorial } from "@/lib/tutorial-storage";

export const runtime = "nodejs";

export async function GET() {
  const tutorials = await listTutorials();

  if (hasActiveTutorials(tutorials)) {
    after(runTutorialQueue);
  }

  return Response.json({ tutorials });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");

  if (contentType?.split(";", 1)[0].toLowerCase() !== "application/pdf") {
    return Response.json(
      { message: "Only PDF files are supported." },
      { status: 415 },
    );
  }

  if (
    isContentLengthOverLimit(
      request.headers.get("content-length"),
      MAX_DOCUMENT_SIZE,
    )
  ) {
    return Response.json(
      { message: "The document is too large to store." },
      { status: 413 },
    );
  }

  const documentName = readDocumentName(
    request.headers.get("x-document-name"),
  );

  if (!documentName) {
    return Response.json(
      { message: "Choose a PDF file to upload." },
      { status: 400 },
    );
  }

  if (!documentName.toLowerCase().endsWith(".pdf")) {
    return Response.json(
      { message: "Only PDF files are supported." },
      { status: 415 },
    );
  }

  if (!request.body) {
    return Response.json(
      { message: "Choose a PDF file to upload." },
      { status: 400 },
    );
  }

  const tutorialId = randomUUID();
  const tutorialDir = tutorialDirectory(tutorialId);
  const filePath = tutorialFilePath(tutorialId, documentFileName);
  let sourcePageCount: number;

  try {
    await fs.mkdir(tutorialDir, { recursive: true });
    await streamUploadToFile(request.body, filePath);
    sourcePageCount = await readPdfPageCount(filePath);
  } catch (error) {
    await fs.rm(tutorialDir, { force: true, recursive: true });

    if (error instanceof DocumentTooLargeError) {
      return Response.json(
        { message: "The document is too large to store." },
        { status: 413 },
      );
    }

    console.error("PDF validation failed:", error);
    return Response.json(
      { message: "The PDF could not be read." },
      { status: 400 },
    );
  }

  let tutorial: StoredTutorial;

  try {
    tutorial = await createQueuedTutorial(
      documentName,
      tutorialId,
      sourcePageCount,
    );
  } catch (error) {
    await fs.rm(tutorialDir, { force: true, recursive: true });
    throw error;
  }

  after(runTutorialQueue);

  return Response.json(
    { tutorial: toTutorialResponse(tutorial) },
    { status: 202 },
  );
}

class DocumentTooLargeError extends Error {}

async function streamUploadToFile(
  body: ReadableStream<Uint8Array>,
  filePath: string,
) {
  let byteLength = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      byteLength += chunk.byteLength;

      if (byteLength > MAX_DOCUMENT_SIZE) {
        callback(new DocumentTooLargeError());
        return;
      }

      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(
      body as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
    ),
    sizeGuard,
    createWriteStream(filePath, { flags: "wx" }),
  );
}

function readDocumentName(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const name = decodeURIComponent(value).trim();
    return name && path.basename(name) === name ? name : null;
  } catch {
    return null;
  }
}

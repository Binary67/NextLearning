import {
  MAX_DOCUMENT_SIZE,
  readDocumentFile,
  readStoredDocument,
  saveDocument,
  type DocumentType,
  type StoredDocument,
} from "@/lib/document-storage";

export const runtime = "nodejs";

export async function GET() {
  const document = await readStoredDocument();

  return Response.json({
    document: document ? await toDocumentResponse(document) : null,
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { message: "Choose a PDF or Markdown file to upload." },
      { status: 400 },
    );
  }

  const type = getDocumentType(file);

  if (!type) {
    return Response.json(
      { message: "Only PDF and Markdown files are supported." },
      { status: 415 },
    );
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    return Response.json(
      { message: "The document must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  const document = await saveDocument(file, type);

  return Response.json({
    document: await toDocumentResponse(document),
  });
}

function getDocumentType(file: File): DocumentType | null {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf" && file.type === "application/pdf") {
    return "pdf";
  }

  if (
    (extension === "md" || extension === "markdown") &&
    ["text/markdown", "text/plain", "application/octet-stream", ""].includes(
      file.type,
    )
  ) {
    return "markdown";
  }

  return null;
}

async function toDocumentResponse(document: StoredDocument) {
  return {
    name: document.name,
    type: document.type,
    url: "/api/document/file",
    content:
      document.type === "markdown"
        ? (await readDocumentFile(document)).toString("utf8")
        : undefined,
  };
}

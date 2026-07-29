import { promises as fs } from "node:fs";
import path from "node:path";

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

export type DocumentType = "markdown" | "pdf";

export type StoredDocument = {
  fileName: string;
  name: string;
  type: DocumentType;
};

const documentsDirectory = path.join(process.cwd(), "data", "documents");
const metadataPath = path.join(documentsDirectory, "current.json");

export async function readStoredDocument(): Promise<StoredDocument | null> {
  try {
    const metadata = await fs.readFile(metadataPath, "utf8");
    return JSON.parse(metadata) as StoredDocument;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

export async function readDocumentFile(document: StoredDocument) {
  return fs.readFile(path.join(documentsDirectory, document.fileName));
}

export async function saveDocument(
  file: File,
  type: DocumentType,
): Promise<StoredDocument> {
  const previousDocument = await readStoredDocument();
  const fileName = type === "pdf" ? "current.pdf" : "current.md";
  const document = { fileName, name: file.name, type };

  await fs.mkdir(documentsDirectory, { recursive: true });
  await fs.writeFile(
    path.join(documentsDirectory, fileName),
    Buffer.from(await file.arrayBuffer()),
  );
  await fs.writeFile(metadataPath, JSON.stringify(document, null, 2));

  if (previousDocument && previousDocument.fileName !== fileName) {
    await fs.unlink(
      path.join(documentsDirectory, previousDocument.fileName),
    ).catch((error: unknown) => {
      if (!isMissingFileError(error)) {
        throw error;
      }
    });
  }

  return document;
}

function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

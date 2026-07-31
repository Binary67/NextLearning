import { promises as fs } from "node:fs";
import path from "node:path";

import type { DocumentModel } from "@/lib/document-model";
import {
  createLearningProgress,
  type LearningProgress,
} from "@/lib/learning-progress";
import type { TeachingPlan } from "@/lib/teaching-plan";

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

export type StoredDocument = {
  id: string;
  fileName: string;
  name: string;
  type: "pdf";
};

const documentsDirectory = path.join(process.cwd(), "data", "documents");
const metadataPath = path.join(documentsDirectory, "current.json");
const documentModelPath = path.join(
  documentsDirectory,
  "document-model.json",
);
const teachingPlanPath = path.join(
  documentsDirectory,
  "teaching-plan.json",
);
const learningProgressPath = path.join(
  documentsDirectory,
  "learning-progress.json",
);

export async function readStoredDocument(): Promise<StoredDocument | null> {
  return readJsonFile<StoredDocument>(metadataPath);
}

export async function readDocumentFile(document: StoredDocument) {
  return fs.readFile(path.join(documentsDirectory, document.fileName));
}

export async function readDocumentModel(): Promise<DocumentModel | null> {
  return readJsonFile<DocumentModel>(documentModelPath);
}

export async function readTeachingPlan(): Promise<TeachingPlan | null> {
  return readJsonFile<TeachingPlan>(teachingPlanPath);
}

export async function readLearningProgress(): Promise<LearningProgress | null> {
  return readJsonFile<LearningProgress>(learningProgressPath);
}

export async function saveLearningProgress(progress: LearningProgress) {
  await fs.writeFile(
    learningProgressPath,
    JSON.stringify(progress, null, 2),
  );
}

export async function deleteStoredDocument() {
  const document = await readStoredDocument();

  if (!document) {
    return false;
  }

  await fs.rm(metadataPath, { force: true });
  await fs.rm(documentModelPath, { force: true });
  await fs.rm(teachingPlanPath, { force: true });
  await fs.rm(learningProgressPath, { force: true });
  await fs.rm(path.join(documentsDirectory, document.fileName), {
    force: true,
  });

  return true;
}

export async function saveDocument(
  file: File,
  documentId: string,
  model: DocumentModel,
  plan: TeachingPlan,
): Promise<StoredDocument> {
  const fileName = "current.pdf";
  const document: StoredDocument = {
    id: documentId,
    fileName,
    name: file.name,
    type: "pdf",
  };
  const fileData = Buffer.from(await file.arrayBuffer());

  await fs.mkdir(documentsDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(documentsDirectory, fileName), fileData),
    fs.writeFile(documentModelPath, JSON.stringify(model, null, 2)),
    fs.writeFile(teachingPlanPath, JSON.stringify(plan, null, 2)),
    fs.writeFile(
      learningProgressPath,
      JSON.stringify(createLearningProgress(documentId), null, 2),
    ),
  ]);
  await fs.writeFile(metadataPath, JSON.stringify(document, null, 2));

  return document;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

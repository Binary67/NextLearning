import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { DocumentModel } from "@/lib/document-model";

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

export type StoredTutorial = {
  id: string;
  title: string;
  documentName: string;
  createdAt: string;
};

const tutorialsDirectory = path.join(process.cwd(), "data", "tutorials");
const tutorialMetadataFileName = "tutorial.json";
const documentFileName = "source.pdf";
const documentModelFileName = "document-model.json";
const tutorialIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTutorialId(value: string) {
  return tutorialIdPattern.test(value);
}

export async function listStoredTutorialIds() {
  try {
    const entries = await fs.readdir(tutorialsDirectory, {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isDirectory() && isTutorialId(entry.name))
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

export async function readStoredTutorial(
  tutorialId: string,
): Promise<StoredTutorial | null> {
  if (!isTutorialId(tutorialId)) {
    return null;
  }

  return readJsonFile<StoredTutorial>(
    tutorialFilePath(tutorialId, tutorialMetadataFileName),
  );
}

export async function readDocumentFile(tutorialId: string) {
  return fs.readFile(tutorialFilePath(tutorialId, documentFileName));
}

export async function readDocumentModel(
  tutorialId: string,
): Promise<DocumentModel | null> {
  return readJsonFile<DocumentModel>(
    tutorialFilePath(tutorialId, documentModelFileName),
  );
}

export async function deleteStoredTutorial(tutorialId: string) {
  const tutorial = await readStoredTutorial(tutorialId);

  if (!tutorial) {
    return false;
  }

  await fs.rm(tutorialDirectory(tutorialId), {
    force: true,
    recursive: true,
  });

  return true;
}

export async function saveTutorial(
  documentName: string,
  fileData: Buffer,
  tutorialId: string,
  model: DocumentModel,
): Promise<StoredTutorial> {
  const tutorial: StoredTutorial = {
    id: tutorialId,
    title: model.title,
    documentName,
    createdAt: new Date().toISOString(),
  };

  await fs.mkdir(tutorialDirectory(tutorialId), { recursive: true });
  await Promise.all([
    fs.writeFile(tutorialFilePath(tutorialId, documentFileName), fileData),
    writeJsonFileAtomically(
      tutorialFilePath(tutorialId, documentModelFileName),
      model,
    ),
    writeJsonFileAtomically(
      tutorialFilePath(tutorialId, tutorialMetadataFileName),
      tutorial,
    ),
  ]);

  return tutorial;
}

function tutorialDirectory(tutorialId: string) {
  return path.join(tutorialsDirectory, tutorialId);
}

function tutorialFilePath(tutorialId: string, fileName: string) {
  return path.join(tutorialDirectory(tutorialId), fileName);
}

async function writeJsonFileAtomically(
  filePath: string,
  value: unknown,
) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2));
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
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

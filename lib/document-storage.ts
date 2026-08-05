import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import type { DocumentEmbeddings } from "@/lib/document-embeddings";
import type { DocumentModel } from "@/lib/document-model";

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

export type TutorialStatus =
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type StoredTutorial = {
  id: string;
  title: string;
  documentName: string;
  createdAt: string;
  updatedAt: string;
  sourcePageCount: number;
  status: TutorialStatus;
  error: string | null;
};

const tutorialsDirectory = path.join(process.cwd(), "data", "tutorials");
const tutorialMetadataFileName = "tutorial.json";
const documentFileName = "source.pdf";
const documentModelFileName = "document-model.json";
const documentEmbeddingsFileName = "document-embeddings.json";
const learningStateFileName = "learning-state.json";
const tutorialIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const learningStateUpdates = new Map<string, Promise<void>>();

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

export async function listStoredTutorials() {
  const tutorialIds = await listStoredTutorialIds();
  const tutorials = await Promise.all(
    tutorialIds.map((tutorialId) => readStoredTutorial(tutorialId)),
  );

  return tutorials
    .filter((tutorial): tutorial is StoredTutorial => tutorial !== null)
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt),
    );
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

export async function statDocumentFile(tutorialId: string) {
  const stats = await fs.stat(
    tutorialFilePath(tutorialId, documentFileName),
    { bigint: true },
  );
  const identity = [
    stats.dev,
    stats.ino,
    stats.size,
    stats.mtimeNs,
  ].join(":");
  const etag = createHash("sha256")
    .update(identity)
    .digest("base64url");

  return {
    etag: `"${etag}"`,
    size: Number(stats.size),
  };
}

export function streamDocumentFile(
  tutorialId: string,
  range?: { start: number; end: number },
) {
  const stream = createReadStream(
    tutorialFilePath(tutorialId, documentFileName),
    range,
  );

  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

export async function readDocumentModel(
  tutorialId: string,
): Promise<DocumentModel | null> {
  return readJsonFile<DocumentModel>(
    tutorialFilePath(tutorialId, documentModelFileName),
  );
}

export async function readDocumentEmbeddings(
  tutorialId: string,
): Promise<DocumentEmbeddings | null> {
  return readJsonFile<DocumentEmbeddings>(
    tutorialFilePath(tutorialId, documentEmbeddingsFileName),
  );
}

export function readStoredLearningState(
  tutorialId: string,
): Promise<unknown | null> {
  return readJsonFile<unknown>(
    tutorialFilePath(tutorialId, learningStateFileName),
  );
}

export async function updateStoredLearningState<T>(
  tutorialId: string,
  update: (stored: unknown | null) => T | Promise<T>,
): Promise<T> {
  const previous = learningStateUpdates.get(tutorialId) ?? Promise.resolve();
  let release: () => void = () => {};
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => turn);

  learningStateUpdates.set(tutorialId, queued);
  await previous;

  try {
    const updated = await update(
      await readStoredLearningState(tutorialId),
    );
    await writeJsonFileAtomically(
      tutorialFilePath(tutorialId, learningStateFileName),
      updated,
    );
    return updated;
  } finally {
    release();

    if (learningStateUpdates.get(tutorialId) === queued) {
      learningStateUpdates.delete(tutorialId);
    }
  }
}

export async function hasDocumentEmbeddings(tutorialId: string) {
  try {
    await fs.access(
      tutorialFilePath(tutorialId, documentEmbeddingsFileName),
    );
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
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

export async function createQueuedTutorial(
  documentName: string,
  fileData: Buffer,
  tutorialId: string,
  sourcePageCount: number,
): Promise<StoredTutorial> {
  const createdAt = new Date().toISOString();
  const tutorial: StoredTutorial = {
    id: tutorialId,
    title: documentName.replace(/\.pdf$/i, ""),
    documentName,
    createdAt,
    updatedAt: createdAt,
    sourcePageCount,
    status: "queued",
    error: null,
  };

  await fs.mkdir(tutorialDirectory(tutorialId), { recursive: true });
  await fs.writeFile(
    tutorialFilePath(tutorialId, documentFileName),
    fileData,
  );
  await writeStoredTutorial(tutorial);

  return tutorial;
}

export async function updateStoredTutorial(
  tutorial: StoredTutorial,
  updates: Partial<
    Pick<StoredTutorial, "error" | "status" | "title">
  >,
) {
  const updatedTutorial: StoredTutorial = {
    ...tutorial,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeStoredTutorial(updatedTutorial);
  return updatedTutorial;
}

export async function savePreparedTutorial(
  tutorial: StoredTutorial,
  model: DocumentModel,
  embeddings: DocumentEmbeddings,
): Promise<StoredTutorial> {
  await Promise.all([
    writeJsonFileAtomically(
      tutorialFilePath(tutorial.id, documentModelFileName),
      model,
    ),
    writeJsonFileAtomically(
      tutorialFilePath(tutorial.id, documentEmbeddingsFileName),
      embeddings,
    ),
  ]);

  return updateStoredTutorial(tutorial, {
    title: model.title,
    status: "ready",
    error: null,
  });
}

function tutorialDirectory(tutorialId: string) {
  return path.join(tutorialsDirectory, tutorialId);
}

function tutorialFilePath(tutorialId: string, fileName: string) {
  return path.join(tutorialDirectory(tutorialId), fileName);
}

function writeStoredTutorial(tutorial: StoredTutorial) {
  return writeJsonFileAtomically(
    tutorialFilePath(tutorial.id, tutorialMetadataFileName),
    tutorial,
  );
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

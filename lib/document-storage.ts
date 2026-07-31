import { promises as fs } from "node:fs";
import path from "node:path";

import type { DocumentLayout } from "@/lib/document-layout";
import type { DocumentModel } from "@/lib/document-model";
import {
  createLearningProgress,
  type LearningProgress,
} from "@/lib/learning-progress";
import type { TeachingGrounding } from "@/lib/teaching-grounding";
import type { TeachingPlan } from "@/lib/teaching-plan";

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

export type StoredTutorial = {
  id: string;
  title: string;
  documentName: string;
  type: "pdf";
  createdAt: string;
};

const tutorialsDirectory = path.join(process.cwd(), "data", "tutorials");
const tutorialMetadataFileName = "tutorial.json";
const documentFileName = "source.pdf";
const documentModelFileName = "document-model.json";
const documentLayoutFileName = "document-layout.json";
const teachingPlanFileName = "teaching-plan.json";
const teachingGroundingFileName = "teaching-grounding.json";
const learningProgressFileName = "learning-progress.json";
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

export async function readDocumentLayout(
  tutorialId: string,
): Promise<DocumentLayout | null> {
  return readJsonFile<DocumentLayout>(
    tutorialFilePath(tutorialId, documentLayoutFileName),
  );
}

export async function readTeachingPlan(
  tutorialId: string,
): Promise<TeachingPlan | null> {
  return readJsonFile<TeachingPlan>(
    tutorialFilePath(tutorialId, teachingPlanFileName),
  );
}

export async function readTeachingGrounding(
  tutorialId: string,
): Promise<TeachingGrounding | null> {
  return readJsonFile<TeachingGrounding>(
    tutorialFilePath(tutorialId, teachingGroundingFileName),
  );
}

export async function readLearningProgress(
  tutorialId: string,
): Promise<LearningProgress | null> {
  return readJsonFile<LearningProgress>(
    tutorialFilePath(tutorialId, learningProgressFileName),
  );
}

export async function saveLearningProgress(
  tutorialId: string,
  progress: LearningProgress,
) {
  await fs.writeFile(
    tutorialFilePath(tutorialId, learningProgressFileName),
    JSON.stringify(progress, null, 2),
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
  file: File,
  tutorialId: string,
  model: DocumentModel,
  plan: TeachingPlan,
  layout: DocumentLayout,
  grounding: TeachingGrounding,
): Promise<StoredTutorial> {
  const createdAt = new Date().toISOString();
  const tutorial: StoredTutorial = {
    id: tutorialId,
    title: model.title,
    documentName: file.name,
    type: "pdf",
    createdAt,
  };
  const fileData = Buffer.from(await file.arrayBuffer());
  const directory = tutorialDirectory(tutorialId);

  await fs.mkdir(directory, { recursive: true });
  await Promise.all([
    fs.writeFile(tutorialFilePath(tutorialId, documentFileName), fileData),
    fs.writeFile(
      tutorialFilePath(tutorialId, documentModelFileName),
      JSON.stringify(model, null, 2),
    ),
    fs.writeFile(
      tutorialFilePath(tutorialId, documentLayoutFileName),
      JSON.stringify(layout, null, 2),
    ),
    fs.writeFile(
      tutorialFilePath(tutorialId, teachingPlanFileName),
      JSON.stringify(plan, null, 2),
    ),
    fs.writeFile(
      tutorialFilePath(tutorialId, teachingGroundingFileName),
      JSON.stringify(grounding, null, 2),
    ),
    fs.writeFile(
      tutorialFilePath(tutorialId, learningProgressFileName),
      JSON.stringify(createLearningProgress(tutorialId, createdAt), null, 2),
    ),
  ]);
  await fs.writeFile(
    tutorialFilePath(tutorialId, tutorialMetadataFileName),
    JSON.stringify(tutorial, null, 2),
  );

  return tutorial;
}

function tutorialDirectory(tutorialId: string) {
  return path.join(tutorialsDirectory, tutorialId);
}

function tutorialFilePath(tutorialId: string, fileName: string) {
  return path.join(tutorialDirectory(tutorialId), fileName);
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

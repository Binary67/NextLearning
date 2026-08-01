import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { DocumentModel } from "@/lib/document-model";
import {
  createLearningProgress,
  type LearningProgress,
} from "@/lib/learning-progress";
import type {
  TeachingPlan,
  TeachingUnitDetails,
} from "@/lib/teaching-plan";
import {
  createTutorialGenerationStatus,
  type TutorialGenerationStatus,
} from "@/lib/tutorial-generation-status";

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
const teachingPlanFileName = "teaching-plan.json";
const generationStatusFileName = "generation-status.json";
const learningProgressFileName = "learning-progress.json";
const teachingUnitsDirectoryName = "units";
const tutorialIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const teachingUnitIdPattern = /^unit:[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export async function readTeachingPlan(
  tutorialId: string,
): Promise<TeachingPlan | null> {
  return readJsonFile<TeachingPlan>(
    tutorialFilePath(tutorialId, teachingPlanFileName),
  );
}

export async function readTutorialGenerationStatus(
  tutorialId: string,
): Promise<TutorialGenerationStatus | null> {
  return readJsonFile<TutorialGenerationStatus>(
    tutorialFilePath(tutorialId, generationStatusFileName),
  );
}

export async function readTeachingUnitDetails(
  tutorialId: string,
  unitId: string,
): Promise<TeachingUnitDetails | null> {
  if (!isTutorialId(tutorialId) || !teachingUnitIdPattern.test(unitId)) {
    return null;
  }

  return readJsonFile<TeachingUnitDetails>(
    teachingUnitFilePath(tutorialId, unitId),
  );
}

export async function readLearningProgress(
  tutorialId: string,
): Promise<LearningProgress | null> {
  return readJsonFile<LearningProgress>(
    tutorialFilePath(tutorialId, learningProgressFileName),
  );
}

export async function saveTeachingUnitDetails(
  tutorialId: string,
  details: TeachingUnitDetails,
) {
  await writeJsonFileAtomically(
    teachingUnitFilePath(tutorialId, details.unit_id),
    details,
  );
}

export async function saveTutorialGenerationStatus(
  tutorialId: string,
  status: TutorialGenerationStatus,
) {
  await writeJsonFileAtomically(
    tutorialFilePath(tutorialId, generationStatusFileName),
    status,
  );
}

export async function saveLearningProgress(
  tutorialId: string,
  progress: LearningProgress,
) {
  await writeJsonFileAtomically(
    tutorialFilePath(tutorialId, learningProgressFileName),
    progress,
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
  plan: TeachingPlan,
  firstUnitDetails: TeachingUnitDetails,
): Promise<StoredTutorial> {
  const createdAt = new Date().toISOString();
  const tutorial: StoredTutorial = {
    id: tutorialId,
    title: model.title,
    documentName,
    type: "pdf",
    createdAt,
  };
  const generationStatus = createTutorialGenerationStatus(
    plan,
    firstUnitDetails.unit_id,
    createdAt,
  );

  await fs.mkdir(teachingUnitsDirectory(tutorialId), { recursive: true });
  await Promise.all([
    fs.writeFile(tutorialFilePath(tutorialId, documentFileName), fileData),
    writeJsonFileAtomically(
      tutorialFilePath(tutorialId, documentModelFileName),
      model,
    ),
    writeJsonFileAtomically(
      tutorialFilePath(tutorialId, teachingPlanFileName),
      plan,
    ),
    saveTeachingUnitDetails(tutorialId, firstUnitDetails),
    saveTutorialGenerationStatus(tutorialId, generationStatus),
    saveLearningProgress(
      tutorialId,
      createLearningProgress(tutorialId, createdAt),
    ),
  ]);
  await writeJsonFileAtomically(
    tutorialFilePath(tutorialId, tutorialMetadataFileName),
    tutorial,
  );

  return tutorial;
}

function tutorialDirectory(tutorialId: string) {
  return path.join(tutorialsDirectory, tutorialId);
}

function teachingUnitsDirectory(tutorialId: string) {
  return path.join(
    tutorialDirectory(tutorialId),
    teachingUnitsDirectoryName,
  );
}

function tutorialFilePath(tutorialId: string, fileName: string) {
  return path.join(tutorialDirectory(tutorialId), fileName);
}

function teachingUnitFilePath(tutorialId: string, unitId: string) {
  return path.join(teachingUnitsDirectory(tutorialId), `${unitId}.json`);
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

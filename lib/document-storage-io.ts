import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  batchFilePath,
  tutorialDirectory,
} from "@/lib/document-storage-paths";

export async function writeBatchFile(
  tutorialId: string,
  directoryName: string,
  batchIndex: number,
  value: unknown,
) {
  const directory = path.join(
    tutorialDirectory(tutorialId),
    directoryName,
  );
  await fs.mkdir(directory, { recursive: true });
  return writeJsonFileAtomically(
    batchFilePath(tutorialId, directoryName, batchIndex),
    value,
  );
}

export async function copyFileAtomically(
  sourceFilePath: string,
  destinationPath: string,
) {
  const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;

  try {
    await fs.copyFile(sourceFilePath, temporaryPath);
    await fs.rename(temporaryPath, destinationPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeJsonFileAtomically(
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

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
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

export function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

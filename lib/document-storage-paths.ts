import path from "node:path";

export const tutorialsDirectory = path.join(
  process.cwd(),
  "data",
  "tutorials",
);
export const tutorialMetadataFileName = "tutorial.json";
export const documentFileName = "source.pdf";
export const documentModelFileName = "document.json";
export const progressFileName = "progress.json";
export const generatedBatchesDirectoryName = "generated-batches";
export const embeddingsDirectoryName = "embeddings";
export const publishedDocumentModelsDirectoryName = "published-models";

export function tutorialDirectory(tutorialId: string) {
  return path.join(tutorialsDirectory, tutorialId);
}

export function tutorialFilePath(tutorialId: string, fileName: string) {
  return path.join(tutorialDirectory(tutorialId), fileName);
}

export function batchFilePath(
  tutorialId: string,
  directoryName: string,
  batchIndex: number,
) {
  return path.join(
    tutorialDirectory(tutorialId),
    directoryName,
    `${String(batchIndex).padStart(4, "0")}.json`,
  );
}

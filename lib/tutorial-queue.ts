import {
  MissingAzureOpenAIConfigurationError,
  retryAzureOpenAIRateLimits,
} from "@/lib/azure-openai-generation-retry";
import { generateDocumentEmbeddingBatches } from "@/lib/document-embedding-generation";
import {
  getContiguousCompletedBatchCount,
  type DocumentPreparation,
} from "@/lib/document-batches";
import { consolidateDocumentBatches } from "@/lib/document-consolidation";
import type { DocumentModel } from "@/lib/document-model";
import {
  documentFilePath,
  readDocumentEmbeddingBatch,
  readDocumentFile,
  readGeneratedDocumentBatch,
  readPublishedDocumentModel,
  writeDocumentEmbeddingBatch,
  writeDocumentModel,
  writeGeneratedDocumentBatch,
} from "@/lib/document-artifact-storage";
import {
  listStoredTutorials,
  markTutorialPrepared,
  updateStoredTutorial,
} from "@/lib/tutorial-storage";
import type { StoredTutorial } from "@/lib/document-storage-types";
import { openPdfBatchReader } from "@/lib/pdf-document-batches";
import { generateDocumentBatch } from "@/lib/tutorial-generation";

type TutorialQueueState = {
  promise: Promise<void> | null;
  drainRequested: boolean;
  recovered: boolean;
};

type TutorialUpdates = Partial<
  Pick<
    StoredTutorial,
    "error" | "preparation" | "publishedBatchCount" | "status" | "title"
  >
>;

type UpdateTutorial = (
  updates: TutorialUpdates,
) => Promise<StoredTutorial>;

type PublishPrefix = (
  tutorial: StoredTutorial,
  publishedBatchCount: number,
) => Promise<StoredTutorial>;

const queueGlobal = globalThis as typeof globalThis & {
  nextLearningTutorialQueue?: TutorialQueueState;
};
const queueState = getTutorialQueueState();

function getTutorialQueueState() {
  if (!queueGlobal.nextLearningTutorialQueue) {
    queueGlobal.nextLearningTutorialQueue = {
      promise: null,
      drainRequested: false,
      recovered: false,
    };
  }

  return queueGlobal.nextLearningTutorialQueue;
}

export function runTutorialQueue() {
  queueState.drainRequested = true;

  if (!queueState.promise) {
    queueState.promise = drainTutorialQueue()
      .catch((error) => {
        console.error("Tutorial queue failed:", error);
      })
      .finally(() => {
        queueState.promise = null;
      });
  }

  return queueState.promise;
}

async function drainTutorialQueue() {
  do {
    queueState.drainRequested = false;
    let tutorials = (await listStoredTutorials()).sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt),
    );

    if (!queueState.recovered) {
      tutorials = await requeueInterruptedTutorials(tutorials);
      queueState.recovered = true;
    }

    for (const tutorial of tutorials) {
      if (tutorial.status !== "queued") {
        continue;
      }
      await prepareTutorial(tutorial);
    }
  } while (queueState.drainRequested);
}

function requeueInterruptedTutorials(tutorials: StoredTutorial[]) {
  return Promise.all(
    tutorials.map((tutorial) => {
      if (tutorial.status !== "processing") {
        return tutorial;
      }

      return updateStoredTutorial(tutorial, {
        status: "queued",
        error: null,
      });
    }),
  );
}

async function prepareTutorial(queuedTutorial: StoredTutorial) {
  let tutorial = await updateStoredTutorial(queuedTutorial, {
    status: "processing",
    error: null,
  });
  let pendingMetadataUpdate: Promise<unknown> = Promise.resolve();
  let stage = "reading the source document";

  const updateTutorial: UpdateTutorial = (updates) => {
    const queuedUpdates = updates.preparation
      ? {
          ...updates,
          preparation: copyPreparation(updates.preparation),
        }
      : updates;
    const nextUpdate = pendingMetadataUpdate.then(async () => {
      tutorial = await updateStoredTutorial(tutorial, queuedUpdates);
      return tutorial;
    });

    pendingMetadataUpdate = nextUpdate.catch(() => {});
    return nextUpdate;
  };

  try {
    const preparation = resetInterruptedBatch(tutorial.preparation);

    stage = "document batch analysis";
    let latestModel: DocumentModel | null = null;
    const publishPrefix: PublishPrefix = async (
      currentTutorial,
      publishedBatchCount,
    ) => {
      const published = await publishDocumentPrefix(
        currentTutorial,
        publishedBatchCount,
        updateTutorial,
      );
      latestModel = published.model;
      return published.tutorial;
    };

    tutorial = await analyzeDocumentBatches(
      tutorial,
      preparation,
      updateTutorial,
      publishPrefix,
    );

    stage = "document consolidation";
    tutorial = await updateTutorial({
      preparation: {
        ...tutorial.preparation,
        phase: "embedding",
      },
    });

    const publishedBatchCount = tutorial.preparation.batches.length;

    if (tutorial.publishedBatchCount !== publishedBatchCount) {
      tutorial = await publishPrefix(tutorial, publishedBatchCount);
    }

    stage = "embedding generation";
    latestModel ??= await readPublishedDocumentModel(
      tutorial.id,
      publishedBatchCount,
    );

    if (!latestModel) {
      throw new Error("The published document model is missing.");
    }

    tutorial = await updateTutorial({
      preparation: {
        ...tutorial.preparation,
        phase: "complete",
      },
    });
    await markTutorialPrepared(tutorial, latestModel.title);
  } catch (error) {
    console.error(
      `Document ${tutorial.id} preparation failed during ${stage}:`,
      error,
    );
    await updateTutorial({
      status: "failed",
      error: getPreparationFailureMessage(error),
    });
  }
}

async function analyzeDocumentBatches(
  initialTutorial: StoredTutorial,
  preparation: DocumentPreparation,
  updateTutorial: UpdateTutorial,
  publishPrefix: PublishPrefix,
) {
  let tutorial = initialTutorial;
  let currentPreparation = preparation;
  let nextBatchIndex = 0;
  const workerState: { failure: { error: unknown } | null } = {
    failure: null,
  };
  const reconciledBatches = await Promise.all(
    currentPreparation.batches.map(async (batch) => ({
      ...batch,
      status:
        (await readGeneratedDocumentBatch(
          tutorial.id,
          batch.batch_index,
          getBatchValidationContext(tutorial, batch),
        )) === null
          ? ("pending" as const)
          : ("complete" as const),
    })),
  );
  currentPreparation = {
    ...currentPreparation,
    phase: "analyzing",
    batches: reconciledBatches,
  };
  tutorial = await updateTutorial({ preparation: currentPreparation });

  const pendingBatches = [...currentPreparation.batches]
    .filter((batch) => batch.status === "pending")
    .sort((left, right) => left.batch_index - right.batch_index);

  async function publishCompletedPrefix() {
    const contiguousCompletedCount = getContiguousCompletedBatchCount(
      currentPreparation.batches,
    );
    const minimumPublishedBatchCount = Math.min(
      2,
      currentPreparation.batches.length,
    );

    if (
      contiguousCompletedCount < minimumPublishedBatchCount ||
      contiguousCompletedCount <= (tutorial.publishedBatchCount ?? 0)
    ) {
      return;
    }

    tutorial = await publishPrefix(tutorial, contiguousCompletedCount);
  }

  if (pendingBatches.length === 0) {
    currentPreparation = {
      ...currentPreparation,
      batches: currentPreparation.batches.map((batch) => ({
        ...batch,
        status: "complete" as const,
      })),
      phase: "consolidating",
    };
    tutorial = await updateTutorial({ preparation: currentPreparation });
    await publishCompletedPrefix();
    return tutorial;
  }

  const reader = await openPdfBatchReader(
    documentFilePath(tutorial.id),
    tutorial.sourcePageCount,
    pendingBatches,
  );

  let completionQueue: Promise<void> = Promise.resolve();
  let completionFailure: unknown = null;

  async function completeBatch(
    batch: DocumentPreparation["batches"][number],
  ) {
    if (completionFailure !== null) {
      throw completionFailure;
    }

    currentPreparation = {
      ...currentPreparation,
      batches: currentPreparation.batches.map((currentBatch) =>
        currentBatch.batch_index === batch.batch_index
          ? { ...currentBatch, status: "complete" as const }
          : currentBatch,
      ),
    };
    tutorial = await updateTutorial({ preparation: currentPreparation });
    await publishCompletedPrefix();
  }

  function recordBatchCompletion(
    batch: DocumentPreparation["batches"][number],
  ) {
    const completion = completionQueue.then(() => completeBatch(batch));

    completionQueue = completion.catch((error) => {
      completionFailure ??= error;
    });
  }

  async function processBatch(
    batch: DocumentPreparation["batches"][number],
  ) {
    const pdfBatch = await reader.readBatch(batch);
    const generatedBatch = await retryAzureOpenAIRateLimits(() =>
      generateDocumentBatch(
        pdfBatch.fileData,
        tutorial.documentName,
        tutorial.id,
        tutorial.sourcePageCount,
        batch.batch_index,
        batch.start_page,
        batch.end_page,
        pdfBatch.inputStartPage,
        pdfBatch.inputEndPage,
      ),
    );
    await writeGeneratedDocumentBatch(tutorial.id, generatedBatch);
    recordBatchCompletion(batch);
  }

  async function runWorker() {
    while (workerState.failure === null) {
      const batch = pendingBatches[nextBatchIndex];
      nextBatchIndex += 1;

      if (!batch) {
        return;
      }

      try {
        await processBatch(batch);
      } catch (error) {
        workerState.failure ??= { error };
      }
    }
  }

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(2, pendingBatches.length) },
        () => runWorker(),
      ),
    );

    await completionQueue;

    if (workerState.failure !== null) {
      throw workerState.failure.error;
    }
    if (completionFailure !== null) {
      throw completionFailure;
    }

    const verifiedBatches = await Promise.all(
      currentPreparation.batches.map((batch) =>
        readGeneratedDocumentBatch(
          tutorial.id,
          batch.batch_index,
          getBatchValidationContext(tutorial, batch),
        ),
      ),
    );
    if (verifiedBatches.some((batch) => batch === null)) {
      throw new Error("A generated document batch is missing.");
    }

    currentPreparation = {
      ...currentPreparation,
      batches: currentPreparation.batches.map((batch) => ({
        ...batch,
        status: "complete" as const,
      })),
      phase: "consolidating",
    };
    tutorial = await updateTutorial({ preparation: currentPreparation });
    await publishCompletedPrefix();
    return tutorial;
  } finally {
    await reader.close();
  }
}

async function publishDocumentPrefix(
  tutorial: StoredTutorial,
  publishedBatchCount: number,
  updateTutorial: UpdateTutorial,
) {
  const currentPublishedBatchCount = tutorial.publishedBatchCount ?? 0;

  if (publishedBatchCount <= currentPublishedBatchCount) {
    throw new Error("The document prefix is already published.");
  }

  const batchRanges = [...tutorial.preparation.batches]
    .sort((left, right) => left.batch_index - right.batch_index)
    .slice(0, publishedBatchCount);
  const generatedBatches = await Promise.all(
    batchRanges.map((batch) =>
      readGeneratedDocumentBatch(
        tutorial.id,
        batch.batch_index,
        getBatchValidationContext(tutorial, batch),
      ),
    ),
  );

  if (generatedBatches.some((batch) => batch === null)) {
    throw new Error("A generated document batch is missing.");
  }

  const model = await consolidateDocumentBatches(
    await readDocumentFile(tutorial.id),
    tutorial.id,
    batchRanges.at(-1)?.end_page ?? tutorial.sourcePageCount,
    generatedBatches.filter((batch) => batch !== null),
  );
  await writeDocumentModel(tutorial.id, publishedBatchCount, model);

  const embeddingStatuses = await Promise.all(
    batchRanges.map(async (batch) => ({
      batch,
      embeddings: await readDocumentEmbeddingBatch(
        tutorial.id,
        batch.batch_index,
      ),
    })),
  );
  const missingEmbeddingRanges = embeddingStatuses
    .filter(({ embeddings }) => embeddings === null)
    .map(({ batch }) => batch);

  if (missingEmbeddingRanges.length > 0) {
    const embeddingBatches = await generateDocumentEmbeddingBatches(
      model,
      missingEmbeddingRanges,
    );

    for (const { batch_index, embeddings } of embeddingBatches) {
      await writeDocumentEmbeddingBatch(
        tutorial.id,
        batch_index,
        embeddings,
      );
    }
  }

  const persistedEmbeddings = await Promise.all(
    batchRanges.map(({ batch_index }) =>
      readDocumentEmbeddingBatch(tutorial.id, batch_index),
    ),
  );

  if (persistedEmbeddings.some((embeddings) => embeddings === null)) {
    throw new Error("A document embedding batch is missing.");
  }

  const updatedTutorial = await updateTutorial({
    publishedBatchCount,
  });

  return { model, tutorial: updatedTutorial };
}

function getBatchValidationContext(
  tutorial: StoredTutorial,
  batch: DocumentPreparation["batches"][number],
) {
  return {
    documentId: tutorial.id,
    sourcePageCount: tutorial.sourcePageCount,
    batchIndex: batch.batch_index,
    startPage: batch.start_page,
    endPage: batch.end_page,
  };
}
function resetInterruptedBatch(
  preparation: DocumentPreparation,
): DocumentPreparation {
  return {
    ...preparation,
    phase: "analyzing" as const,
    batches: preparation.batches.map((batch) => ({
      ...batch,
      status:
        batch.status === "processing"
          ? ("pending" as const)
          : batch.status,
    })),
  };
}

function copyPreparation(
  preparation: DocumentPreparation,
): DocumentPreparation {
  return {
    ...preparation,
    batches: preparation.batches.map((batch) => ({ ...batch })),
  };
}

function getPreparationFailureMessage(error: unknown) {
  if (error instanceof MissingAzureOpenAIConfigurationError) {
    return "Document preparation is not configured. Check the server settings.";
  }

  return "The document could not be prepared. Try again.";
}

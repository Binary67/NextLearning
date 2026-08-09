import {
  MissingAzureOpenAIConfigurationError,
  retryAzureOpenAIRateLimits,
} from "@/lib/azure-openai-generation-retry";
import { generateDocumentEmbeddingBatches } from "@/lib/document-embeddings";
import type { DocumentPreparation } from "@/lib/document-batches";
import { consolidateDocumentBatches } from "@/lib/document-consolidation";
import {
  documentFilePath,
  listStoredTutorials,
  markTutorialPrepared,
  readDocumentFile,
  readGeneratedDocumentBatch,
  type StoredTutorial,
  updateStoredTutorial,
  writeDocumentEmbeddingBatch,
  writeDocumentModel,
  writeGeneratedDocumentBatch,
} from "@/lib/document-storage";
import { openPdfBatchReader } from "@/lib/pdf-document-batches";
import { generateDocumentBatch } from "@/lib/tutorial-generation";

type TutorialQueueState = {
  promise: Promise<void> | null;
  drainRequested: boolean;
  recovered: boolean;
};

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
  let stage = "reading the source document";

  try {
    const preparation = resetInterruptedBatch(tutorial.preparation);

    stage = "document batch analysis";
    tutorial = await analyzeDocumentBatches(tutorial, preparation);

    stage = "document consolidation";
    const batchRanges = [...preparation.batches].sort(
      (left, right) => left.batch_index - right.batch_index,
    );
    const generatedBatches = await Promise.all(
      batchRanges.map((batch) =>
        readGeneratedDocumentBatch(tutorial.id, batch.batch_index, {
          documentId: tutorial.id,
          sourcePageCount: tutorial.sourcePageCount,
          batchIndex: batch.batch_index,
          startPage: batch.start_page,
          endPage: batch.end_page,
        }),
      ),
    );

    if (generatedBatches.some((batch) => batch === null)) {
      throw new Error("A generated document batch is missing.");
    }

    const model = await consolidateDocumentBatches(
      await readDocumentFile(tutorial.id),
      tutorial.id,
      tutorial.sourcePageCount,
      generatedBatches.filter((batch) => batch !== null),
    );
    await writeDocumentModel(tutorial.id, model);

    stage = "embedding generation";
    preparation.phase = "embedding";
    tutorial = await updateStoredTutorial(tutorial, { preparation });

    const embeddingBatches = await generateDocumentEmbeddingBatches(
      model,
      batchRanges,
    );
    for (const { batch_index, embeddings } of embeddingBatches) {
      await writeDocumentEmbeddingBatch(
        tutorial.id,
        batch_index,
        embeddings,
      );
    }

    preparation.phase = "complete";
    tutorial = await updateStoredTutorial(tutorial, { preparation });
    await markTutorialPrepared(tutorial, model.title);
  } catch (error) {
    console.error(
      `Document ${tutorial.id} preparation failed during ${stage}:`,
      error,
    );
    await updateStoredTutorial(tutorial, {
      status: "failed",
      error: getPreparationFailureMessage(error),
    });
  }
}

async function analyzeDocumentBatches(
  initialTutorial: StoredTutorial,
  preparation: DocumentPreparation,
) {
  let tutorial = initialTutorial;
  let nextBatchIndex = 0;
  const workerState: { failure: { error: unknown } | null } = {
    failure: null,
  };
  const reconciledBatches = await Promise.all(
    preparation.batches.map(async (batch) => ({
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
  preparation.batches = reconciledBatches;
  preparation.phase = "analyzing";

  const pendingBatches = preparation.batches.filter(
    (batch) => batch.status === "pending",
  );

  if (pendingBatches.length === 0) {
    preparation.batches = preparation.batches.map((batch) => ({
      ...batch,
      status: "complete" as const,
    }));
    preparation.phase = "consolidating";
    return updateStoredTutorial(tutorial, { preparation });
  }

  const reader = await openPdfBatchReader(
    documentFilePath(tutorial.id),
    tutorial.sourcePageCount,
    pendingBatches,
  );

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

    if (workerState.failure !== null) {
      throw workerState.failure.error;
    }

    const verifiedBatches = await Promise.all(
      preparation.batches.map((batch) =>
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

    preparation.batches = preparation.batches.map((batch) => ({
      ...batch,
      status: "complete" as const,
    }));
    preparation.phase = "consolidating";
    tutorial = await updateStoredTutorial(tutorial, { preparation });
    return tutorial;
  } finally {
    await reader.close();
  }
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

function getPreparationFailureMessage(error: unknown) {
  if (error instanceof MissingAzureOpenAIConfigurationError) {
    return "Document preparation is not configured. Check the server settings.";
  }

  return "The document could not be prepared. Try again.";
}

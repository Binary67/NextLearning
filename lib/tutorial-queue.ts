import {
  MissingAzureOpenAIConfigurationError,
  retryAzureOpenAIRateLimits,
} from "@/lib/azure-openai-generation-retry";
import { generateDocumentEmbeddings } from "@/lib/document-embeddings";
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
import { readPdfBatch } from "@/lib/pdf-document-batches";
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
  if (!queueState.recovered) {
    await requeueInterruptedTutorials();
    queueState.recovered = true;
  }

  do {
    queueState.drainRequested = false;

    while (true) {
      const tutorial = await readNextQueuedTutorial();

      if (!tutorial) {
        break;
      }

      await prepareTutorial(tutorial);
    }
  } while (queueState.drainRequested);
}

async function requeueInterruptedTutorials() {
  const tutorials = await listStoredTutorials();

  await Promise.all(
    tutorials
      .filter((tutorial) => tutorial.status === "processing")
      .map((tutorial) =>
        updateStoredTutorial(tutorial, {
          status: "queued",
          error: null,
        }),
      ),
  );
}

async function readNextQueuedTutorial() {
  const tutorials = await listStoredTutorials();

  return tutorials.find((tutorial) => tutorial.status === "queued") ?? null;
}

async function prepareTutorial(queuedTutorial: StoredTutorial) {
  let tutorial = await updateStoredTutorial(queuedTutorial, {
    status: "processing",
    error: null,
  });
  let stage = "reading the source document";

  try {
    const preparation = resetInterruptedBatch(tutorial.preparation);
    tutorial = await updateStoredTutorial(tutorial, { preparation });

    stage = "document batch analysis";
    for (const batch of preparation.batches) {
      if (batch.status === "complete") {
        continue;
      }

      batch.status = "processing";
      tutorial = await updateStoredTutorial(tutorial, { preparation });
      const pdfBatch = await readPdfBatch(
        documentFilePath(tutorial.id),
        batch.start_page,
        batch.end_page,
        tutorial.sourcePageCount,
      );
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
      batch.status = "complete";
      tutorial = await updateStoredTutorial(tutorial, { preparation });
    }

    stage = "document consolidation";
    preparation.phase = "consolidating";
    tutorial = await updateStoredTutorial(tutorial, { preparation });
    const generatedBatches = await Promise.all(
      preparation.batches.map(({ batch_index }) =>
        readGeneratedDocumentBatch(tutorial.id, batch_index),
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

    for (const batchRange of preparation.batches) {
      const embeddings = await retryAzureOpenAIRateLimits(() =>
        generateDocumentEmbeddings({
          ...model,
          pages: model.pages.slice(
            batchRange.start_page - 1,
            batchRange.end_page,
          ),
        }),
      );
      await writeDocumentEmbeddingBatch(
        tutorial.id,
        batchRange.batch_index,
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

import {
  MissingAzureOpenAIConfigurationError,
  retryAzureOpenAIRateLimits,
} from "@/lib/azure-openai-generation-retry";
import { generateDocumentEmbeddings } from "@/lib/document-embeddings";
import {
  listStoredTutorials,
  readDocumentFile,
  savePreparedTutorial,
  type StoredTutorial,
  updateStoredTutorial,
} from "@/lib/document-storage";
import { generateDocumentModel } from "@/lib/tutorial-generation";

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
  const tutorial = await updateStoredTutorial(queuedTutorial, {
    status: "processing",
    error: null,
  });
  let stage = "reading the source document";

  try {
    const fileData = await readDocumentFile(tutorial.id);
    stage = "document analysis";
    const model = await retryAzureOpenAIRateLimits(() =>
      generateDocumentModel(
        fileData,
        tutorial.documentName,
        tutorial.id,
        tutorial.sourcePageCount,
      ),
    );
    stage = "embedding generation";
    const embeddings = await retryAzureOpenAIRateLimits(() =>
      generateDocumentEmbeddings(model),
    );

    stage = "saving prepared data";
    await savePreparedTutorial(tutorial, model, embeddings);
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

function getPreparationFailureMessage(error: unknown) {
  if (error instanceof MissingAzureOpenAIConfigurationError) {
    return "Document preparation is not configured. Check the server settings.";
  }

  return "The document could not be prepared. Try again.";
}

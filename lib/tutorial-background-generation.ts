import {
  saveTeachingUnitDetails,
  saveTutorialGenerationStatus,
} from "@/lib/document-storage";
import {
  listPreparedTutorials,
  type PreparedTutorial,
  readPreparedTutorial,
} from "@/lib/tutorial";
import { generateTeachingUnitDetails } from "@/lib/tutorial-generation";
import {
  hasPendingTeachingUnits,
  setTeachingUnitGenerationState,
  type TeachingUnitGenerationState,
} from "@/lib/tutorial-generation-status";

const ACTIVE_TUTORIAL_LEASE_MS = 10_000;

type TutorialGenerationScheduler = {
  activeUntil: Map<string, number>;
  preparedTutorials: Map<string, PreparedTutorial>;
  tutorialIds: Set<string>;
  recovery: Promise<void> | null;
  worker: Promise<void> | null;
};

const schedulerGlobal = globalThis as typeof globalThis & {
  nextLearningTutorialGenerationScheduler?: TutorialGenerationScheduler;
};

export function startTutorialGenerationScheduler() {
  const scheduler = getScheduler();

  if (!scheduler.recovery) {
    scheduler.recovery = recoverPendingTutorials(scheduler);
  }

  return scheduler.recovery;
}

export function prioritizeTutorialGeneration(tutorialId: string) {
  const scheduler = getScheduler();

  scheduler.tutorialIds.add(tutorialId);
  scheduler.activeUntil.set(
    tutorialId,
    Date.now() + ACTIVE_TUTORIAL_LEASE_MS,
  );
  startGenerationWorker(scheduler);
}

async function recoverPendingTutorials(
  scheduler: TutorialGenerationScheduler,
) {
  try {
    const tutorials = await listPreparedTutorials();

    for (const tutorial of tutorials) {
      if (hasPendingTeachingUnits(tutorial.generationStatus)) {
        scheduler.tutorialIds.add(tutorial.tutorial.id);
      }
    }

    startGenerationWorker(scheduler);
  } catch (error) {
    console.error("Tutorial generation recovery failed:", error);
  }
}

function startGenerationWorker(scheduler: TutorialGenerationScheduler) {
  if (scheduler.worker || scheduler.tutorialIds.size === 0) {
    return;
  }

  const worker = runGenerationWorker(scheduler).finally(() => {
    if (scheduler.worker === worker) {
      scheduler.worker = null;
    }

    startGenerationWorker(scheduler);
  });

  scheduler.worker = worker;
}

async function runGenerationWorker(scheduler: TutorialGenerationScheduler) {
  while (scheduler.tutorialIds.size > 0) {
    const tutorialId = selectNextTutorial(scheduler);

    try {
      const hasMoreWork = await generateNextTeachingUnit(
        scheduler,
        tutorialId,
      );

      if (!hasMoreWork) {
        removeTutorialFromScheduler(scheduler, tutorialId);
      }
    } catch (error) {
      console.error(
        `Background tutorial generation failed for ${tutorialId}:`,
        error,
      );
      removeTutorialFromScheduler(scheduler, tutorialId);
    }
  }
}

function selectNextTutorial(scheduler: TutorialGenerationScheduler) {
  const now = Date.now();
  let selectedTutorialId: string | null = null;
  let selectedActiveUntil = now;

  for (const tutorialId of scheduler.tutorialIds) {
    const activeUntil = scheduler.activeUntil.get(tutorialId) ?? 0;

    if (activeUntil > selectedActiveUntil) {
      selectedTutorialId = tutorialId;
      selectedActiveUntil = activeUntil;
    }
  }

  return selectedTutorialId ?? scheduler.tutorialIds.values().next().value!;
}

async function generateNextTeachingUnit(
  scheduler: TutorialGenerationScheduler,
  tutorialId: string,
) {
  const prepared = await getPreparedTutorial(scheduler, tutorialId);

  if (!prepared) {
    return false;
  }

  for (const unit of prepared.plan.units) {
    if (prepared.unitDetails[unit.id]) {
      if (prepared.generationStatus.unit_status[unit.id] !== "ready") {
        await saveUnitGenerationState(
          prepared,
          tutorialId,
          unit.id,
          "ready",
        );
      }

      continue;
    }

    const state = prepared.generationStatus.unit_status[unit.id];

    if (state !== "pending" && state !== "generating") {
      continue;
    }

    await saveUnitGenerationState(
      prepared,
      tutorialId,
      unit.id,
      "generating",
    );
    let finalState: TeachingUnitGenerationState = "ready";

    try {
      const details = await generateTeachingUnitDetails(
        prepared.model,
        prepared.plan,
        unit,
      );
      await saveTeachingUnitDetails(tutorialId, details);
      prepared.unitDetails[unit.id] = details;
    } catch (error) {
      console.error(`Teaching unit generation failed for ${unit.id}:`, error);
      finalState = "failed";
    }

    await saveUnitGenerationState(
      prepared,
      tutorialId,
      unit.id,
      finalState,
    );
    return hasPendingTeachingUnits(prepared.generationStatus);
  }

  return false;
}

async function saveUnitGenerationState(
  prepared: PreparedTutorial,
  tutorialId: string,
  unitId: string,
  state: TeachingUnitGenerationState,
) {
  const generationStatus = setTeachingUnitGenerationState(
    prepared.generationStatus,
    unitId,
    state,
  );

  await saveTutorialGenerationStatus(tutorialId, generationStatus);
  prepared.generationStatus = generationStatus;
}

async function getPreparedTutorial(
  scheduler: TutorialGenerationScheduler,
  tutorialId: string,
) {
  const existing = scheduler.preparedTutorials.get(tutorialId);

  if (existing) {
    return existing;
  }

  const prepared = await readPreparedTutorial(tutorialId);

  if (prepared) {
    scheduler.preparedTutorials.set(tutorialId, prepared);
  }

  return prepared;
}

function removeTutorialFromScheduler(
  scheduler: TutorialGenerationScheduler,
  tutorialId: string,
) {
  scheduler.activeUntil.delete(tutorialId);
  scheduler.preparedTutorials.delete(tutorialId);
  scheduler.tutorialIds.delete(tutorialId);
}

function getScheduler() {
  if (!schedulerGlobal.nextLearningTutorialGenerationScheduler) {
    schedulerGlobal.nextLearningTutorialGenerationScheduler = {
      activeUntil: new Map(),
      preparedTutorials: new Map(),
      tutorialIds: new Set(),
      recovery: null,
      worker: null,
    };
  }

  return schedulerGlobal.nextLearningTutorialGenerationScheduler;
}

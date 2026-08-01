import {
  saveTeachingUnitDetails,
  saveTutorialGenerationStatus,
} from "@/lib/document-storage";
import { readPreparedTutorial } from "@/lib/tutorial";
import { generateTeachingUnitDetails } from "@/lib/tutorial-generation";
import { setTeachingUnitGenerationState } from "@/lib/tutorial-generation-status";

const tutorialGenerationJobs = new Map<string, Promise<void>>();
let generationQueue = Promise.resolve();

export function queueRemainingTeachingUnits(tutorialId: string) {
  const existingJob = tutorialGenerationJobs.get(tutorialId);

  if (existingJob) {
    return existingJob;
  }

  const job = generationQueue
    .then(() => generateRemainingTeachingUnits(tutorialId))
    .catch((error) => {
      console.error("Background tutorial generation failed:", error);
    })
    .finally(() => {
      tutorialGenerationJobs.delete(tutorialId);
    });

  tutorialGenerationJobs.set(tutorialId, job);
  generationQueue = job;
  return job;
}

async function generateRemainingTeachingUnits(tutorialId: string) {
  const prepared = await readPreparedTutorial(tutorialId);

  if (!prepared) {
    return;
  }

  let generationStatus = prepared.generationStatus;

  for (const unit of prepared.plan.units) {
    if (prepared.unitDetails[unit.id]) {
      if (generationStatus.unit_status[unit.id] !== "ready") {
        generationStatus = setTeachingUnitGenerationState(
          generationStatus,
          unit.id,
          "ready",
        );
        await saveTutorialGenerationStatus(tutorialId, generationStatus);
      }

      continue;
    }

    generationStatus = setTeachingUnitGenerationState(
      generationStatus,
      unit.id,
      "generating",
    );
    await saveTutorialGenerationStatus(tutorialId, generationStatus);

    try {
      const details = await generateTeachingUnitDetails(
        prepared.model,
        prepared.plan,
        unit,
      );
      await saveTeachingUnitDetails(tutorialId, details);
      prepared.unitDetails[unit.id] = details;
      generationStatus = setTeachingUnitGenerationState(
        generationStatus,
        unit.id,
        "ready",
      );
    } catch (error) {
      console.error(`Teaching unit generation failed for ${unit.id}:`, error);
      generationStatus = setTeachingUnitGenerationState(
        generationStatus,
        unit.id,
        "failed",
      );
    }

    await saveTutorialGenerationStatus(tutorialId, generationStatus);
  }
}

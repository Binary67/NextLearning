import { TutorialWorkspace } from "@/app/tutorial-workspace";
import { isTutorialId } from "@/lib/document-storage";
import type { LearningState } from "@/lib/learning-state";
import { readLearningState } from "@/lib/learning-state-store";
import { readStoredGuidedProgressIfAvailable } from "@/lib/guided-progress-store";
import type { GuidedReadingProgress } from "@/lib/guided-progress";
import {
  type PreparedTutorial,
  readPreparedTutorial,
  toTutorialResponse,
} from "@/lib/tutorial";

export default async function TutorialPage({
  params,
  searchParams,
}: {
  params: Promise<{ tutorialId: string }>;
  searchParams: Promise<{
    reviewConcept?: string | string[];
  }>;
}) {
  const [{ tutorialId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const reviewConcept =
    typeof query.reviewConcept === "string"
      ? query.reviewConcept
      : query.reviewConcept?.[0];
  let initialDocumentError = "";
  let initialLearningStateError = "";
  let prepared: PreparedTutorial | null = null;
  let learningState: LearningState | null = null;
  let guidedProgress: GuidedReadingProgress | null = null;

  if (isTutorialId(tutorialId)) {
    try {
      prepared = await readPreparedTutorial(tutorialId);

      if (prepared) {
        try {
          [learningState, guidedProgress] = await Promise.all([
            readLearningState(tutorialId, prepared.model),
            readStoredGuidedProgressIfAvailable(
              tutorialId,
              prepared.model,
            ),
          ]);
        } catch (error) {
          console.error("Initial learning state could not be loaded:", error);
          initialLearningStateError =
            "Your saved learning progress could not be loaded.";
        }
      }
    } catch (error) {
      console.error("Initial tutorial data could not be loaded:", error);
      initialDocumentError = "The document could not be loaded.";
    }
  }

  if (!prepared && !initialDocumentError) {
    initialDocumentError = "That document is not available.";
  }

  return (
    <TutorialWorkspace
      key={tutorialId}
      tutorialId={tutorialId}
      reviewConcept={reviewConcept}
      initialTutorial={
        prepared
          ? toTutorialResponse(prepared.tutorial, prepared.model)
          : null
      }
      initialModel={prepared?.model ?? null}
      initialLearningState={
        learningState
          ? {
              resume: learningState.resume,
              concepts: Object.fromEntries(
                Object.entries(learningState.concepts).map(
                  ([conceptId, concept]) => [
                    conceptId,
                    { lastChunkId: concept.lastChunkId },
                  ],
                ),
              ),
            }
          : null
      }
      initialGuidedProgress={guidedProgress}
      initialDocumentError={initialDocumentError}
      initialLearningStateError={initialLearningStateError}
    />
  );
}

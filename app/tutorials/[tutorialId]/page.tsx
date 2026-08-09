import type { ProgressiveTutorialResponse } from "@/app/tutorial-progressive";
import { TutorialWorkspace } from "@/app/tutorial-workspace/tutorial-workspace";
import { isTutorialId } from "@/lib/tutorial-storage";
import type { LearningState } from "@/lib/learning-state";
import { readLearningState } from "@/lib/learning-state-store";
import { readStoredGuidedProgressIfAvailable } from "@/lib/guided-progress-store";
import type { GuidedReadingProgress } from "@/lib/guided-progress";
import {
  type AvailableTutorial,
  readAvailableTutorial,
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
  let available: AvailableTutorial | null = null;
  let learningState: LearningState | null = null;
  let guidedProgress: GuidedReadingProgress | null = null;

  if (isTutorialId(tutorialId)) {
    try {
      available = await readAvailableTutorial(tutorialId);

      if (available) {
        try {
          [learningState, guidedProgress] = await Promise.all([
            readLearningState(tutorialId, available.model),
            readStoredGuidedProgressIfAvailable(
              tutorialId,
              available.model,
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

  if (!available && !initialDocumentError) {
    initialDocumentError = "That document is not available.";
  }

  return (
    <TutorialWorkspace
      key={tutorialId}
      tutorialId={tutorialId}
      reviewConcept={reviewConcept}
      initialTutorial={
        available
          ? (toTutorialResponse(
              available.tutorial,
              available.model,
            ) as ProgressiveTutorialResponse)
          : null
      }
      initialModel={available?.model ?? null}
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

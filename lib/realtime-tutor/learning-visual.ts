import type {
  LearningVisual,
  LearningVisualGenerationInput,
} from "@/lib/learning-visual";
import { renderPdfPageImage } from "@/lib/pdf-page-renderer";
import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";
import type { CreateLearningVisualArguments } from "@/lib/realtime-tutor/tools/create-learning-visual";
import { getErrorMessage } from "@/lib/realtime-tutor/transport";

const MAXIMUM_PAGE_IMAGE_DATA_URL_BYTES = 4 * 1024 * 1024;

export async function createLearningVisual(
  runtime: RealtimeTutorRuntime,
  toolArguments: CreateLearningVisualArguments,
) {
  runtime.setLearningVisualState({ status: "generating" });

  try {
    const input = await buildLearningVisualInput(runtime, toolArguments);
    const tutorialId = runtime.optionsRef.current.documentId!;
    const response = await fetch(
      `/api/tutorials/${tutorialId}/learning-visuals`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    const result = (await response.json()) as
      | LearningVisual
      | { message?: string };

    if (!response.ok) {
      throw new Error(
        "message" in result && result.message
          ? result.message
          : "The learning visual could not be created.",
      );
    }

    const visual = result as LearningVisual;
    runtime.setLearningVisualState({ status: "ready", visual });

    return {
      status: "ready" as const,
      visual_id: visual.id,
      title: visual.title,
      strategy: visual.strategy,
      narration_cues: visual.narrationCues,
    };
  } catch (reason) {
    const message = getErrorMessage(
      reason,
      "The learning visual could not be created.",
    );

    runtime.setLearningVisualState({ status: "error", message });
    throw new Error(message);
  }
}

async function buildLearningVisualInput(
  runtime: RealtimeTutorRuntime,
  toolArguments: CreateLearningVisualArguments,
): Promise<LearningVisualGenerationInput> {
  const {
    documentId,
    documentModel,
    selection,
    explanationStyle,
  } = runtime.optionsRef.current;
  const activePage = runtime.activePageContextItemRef.current;

  if (!documentId || !documentModel || !activePage) {
    throw new Error("The active PDF page context is unavailable.");
  }

  const page = documentModel.pages[activePage.pageIndex - 1];

  if (!page) {
    throw new Error("The active PDF page context is unavailable.");
  }

  const guidedSegment = runtime.guidedSegmentStateRef.current;
  const chunkId =
    guidedSegment?.pageIndex === activePage.pageIndex &&
    guidedSegment.segmentIndex !== null
      ? (page.chunks[guidedSegment.segmentIndex]?.id ?? null)
      : null;
  const selectionText =
    selection?.page_index === activePage.pageIndex && selection.text
      ? selection.text
      : null;
  const pageImage = await renderPdfPageImage(
    documentId,
    `/api/tutorials/${documentId}/file`,
    activePage.pageIndex,
    MAXIMUM_PAGE_IMAGE_DATA_URL_BYTES,
  );

  return {
    learnerQuestion: toolArguments.learnerQuestion,
    confusionSummary: toolArguments.confusionSummary,
    learningGoal: toolArguments.learningGoal,
    pageIndex: activePage.pageIndex,
    chunkId,
    selectionText,
    pageImageUrl: pageImage.imageUrl,
    explanationStyle,
  };
}

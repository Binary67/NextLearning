import type { ExplanationStyle } from "@/lib/realtime-tutor/types";

export const learningVisualStrategies = [
  "process",
  "structure",
  "relationship",
  "comparison",
  "quantitative",
  "simulation",
] as const;

export type LearningVisualStrategy =
  | "process"
  | "structure"
  | "relationship"
  | "comparison"
  | "quantitative"
  | "simulation";

export type LearningVisualCue = {
  id: string;
  label: string;
  meaning: string;
};

export type LearningVisual = {
  id: string;
  title: string;
  strategy: LearningVisualStrategy;
  htmlFragment: string;
  narrationCues: LearningVisualCue[];
  altText: string;
};

export type LearningVisualGenerationInput = {
  learnerQuestion: string;
  confusionSummary: string;
  learningGoal: string;
  pageIndex: number;
  chunkId: string | null;
  selectionText: string | null;
  pageImageUrl: string;
  explanationStyle: ExplanationStyle;
};

export const MAX_LEARNING_VISUAL_REQUEST_BYTES = 5 * 1024 * 1024;
export const MAX_LEARNING_VISUAL_PAGE_IMAGE_URL_LENGTH = 4 * 1024 * 1024;

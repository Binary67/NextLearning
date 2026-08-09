import {
  technicalLessonActionValues,
  type TechnicalLessonAction,
} from "@/lib/realtime-tutor/types";

export type TechnicalLessonActionOption = {
  action: TechnicalLessonAction;
  label: string;
};

const technicalLessonActionLabels: Record<TechnicalLessonAction, string> = {
  example: "Show an example",
  visualize: "Visualize it",
  prerequisite: "Prerequisite help",
  walkthrough: "Walk through it",
  formal: "Show the mathematics",
  check: "Test me",
};

export const technicalLessonActions: readonly TechnicalLessonActionOption[] =
  technicalLessonActionValues.map((action) => ({
    action,
    label: technicalLessonActionLabels[action],
  }));

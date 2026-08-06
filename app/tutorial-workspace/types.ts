import type { TutorialResponse } from "@/lib/tutorial";
import type { DocumentModel } from "@/lib/document-model";

export type Modal =
  | "transcript"
  | "settings"
  | "end-session"
  | "delete-tutorial"
  | null;

export type LearningResume = {
  pageIndex: number;
  chunkId: string | null;
};

export type InitialLearningState = {
  resume: LearningResume | null;
  concepts: Record<
    string,
    {
      lastChunkId: string;
    }
  >;
};

export type TutorMode = "read" | "guided" | "review";

export type TutorialWorkspaceProps = {
  tutorialId: string;
  reviewConcept?: string;
  initialTutorial: TutorialResponse | null;
  initialModel: DocumentModel | null;
  initialLearningState: InitialLearningState | null;
  initialDocumentError: string;
  initialLearningStateError: string;
};

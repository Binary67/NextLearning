export type LearningAttemptPhase =
  | "diagnostic"
  | "checkpoint"
  | "review";
export type LearningAttemptResult =
  | "correct"
  | "partial"
  | "incorrect";
export type LearningStatus = "learning" | "reviewing" | "mastered";

export type ConceptLearningState = {
  conceptId: string;
  status: LearningStatus;
  lastChunkId: string;
  lastAttemptAt: string;
  nextReviewAt: string | null;
  consecutiveCorrect: number;
  lastResult: LearningAttemptResult;
  lastConfidence: 1 | 2 | 3 | null;
  misconception: string | null;
};

export type LearningSession = {
  id: string;
  mode: "read" | "guided" | "review";
  startedAt: string;
  endedAt: string;
  conceptsPracticed: string[];
};

export type LearningState = {
  tutorialId: string;
  updatedAt: string;
  resume: { pageIndex: number; chunkId: string | null } | null;
  concepts: Record<string, ConceptLearningState>;
  sessions: LearningSession[];
};

export type LearningAttemptInput = {
  sessionId: string;
  phase: LearningAttemptPhase;
  chunkId: string;
  conceptIds: string[];
  result: LearningAttemptResult;
  confidence: 1 | 2 | 3 | null;
  misconception: string | null;
};

export type LearningSessionInput = LearningSession;

export class LearningStateInputError extends Error {}
export class LearningStateConflictError extends Error {}

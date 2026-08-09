import type { DocumentPreparation } from "@/lib/document-batches";

export type TutorialStatus =
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type StoredTutorial = {
  id: string;
  title: string;
  documentName: string;
  createdAt: string;
  updatedAt: string;
  sourcePageCount: number;
  publishedBatchCount: number | null;
  status: TutorialStatus;
  error: string | null;
  preparation: DocumentPreparation;
};

export type StoredProgress = {
  guided: unknown | null;
  learning: unknown | null;
};

import type {
  DocumentChunk,
  DocumentConcept,
  DocumentModel,
  OccurrenceRole,
} from "@/lib/document-model";

export type LearningAttemptPhase =
  | "diagnostic"
  | "checkpoint"
  | "review";

export type LearningAttemptResult =
  | "correct"
  | "partial"
  | "incorrect";

export type CheckpointSelection = {
  chunk: DocumentChunk;
  concept: DocumentConcept;
  role: Extract<
    OccurrenceRole,
    "introduced" | "defined" | "explained" | "illustrated" | "applied"
  >;
};

export type ReviewCheckpoint = CheckpointSelection & {
  pageIndex: number;
};

export type LearningLoopState = {
  phase: LearningAttemptPhase;
  attemptNumber: 1 | 2;
};

export type LearningLoopAction =
  | "bridge_then_checkpoint"
  | "full_explanation_then_checkpoint"
  | "hint_then_retry"
  | "resolve_correct"
  | "corrective_feedback_then_resolve";

export type LearningLoopTransition = {
  state: LearningLoopState | null;
  action: LearningLoopAction;
  resolved: boolean;
};

const CHECKPOINT_ROLE_PRIORITY: Partial<Record<OccurrenceRole, number>> = {
  introduced: 1,
  applied: 2,
  illustrated: 2,
  defined: 3,
  explained: 3,
};

export function selectPrimaryCheckpoint(
  model: DocumentModel,
  pageIndex: number,
  chunk: DocumentChunk,
  checkpointedConceptIds: ReadonlySet<string>,
): CheckpointSelection | null {
  const chunkConceptIds = new Set(chunk.concept_ids);
  let selected: CheckpointSelection | null = null;
  let selectedPriority = 0;

  for (const concept of model.concepts) {
    if (
      !chunkConceptIds.has(concept.id) ||
      checkpointedConceptIds.has(concept.id)
    ) {
      continue;
    }

    const role = getCheckpointRole(concept, pageIndex);
    const priority = role
      ? (CHECKPOINT_ROLE_PRIORITY[role] ?? 0)
      : 0;

    if (role && priority > selectedPriority) {
      selected = {
        chunk,
        concept,
        role,
      };
      selectedPriority = priority;
    }
  }

  return selected;
}

export function findReviewCheckpoint(
  model: DocumentModel,
  conceptId: string,
  chunkId: string,
): ReviewCheckpoint | null {
  const concept = model.concepts.find((candidate) => candidate.id === conceptId);

  if (!concept) {
    return null;
  }

  for (const page of model.pages) {
    const chunk = page.chunks.find((candidate) => candidate.id === chunkId);

    if (!chunk || !chunk.concept_ids.includes(conceptId)) {
      continue;
    }

    const role = getCheckpointRole(concept, page.page_index);

    if (!role) {
      return null;
    }

    return {
      pageIndex: page.page_index,
      chunk,
      concept,
      role,
    };
  }

  return null;
}

function getCheckpointRole(
  concept: DocumentConcept,
  pageIndex: number,
): CheckpointSelection["role"] | undefined {
  let selected: CheckpointSelection["role"] | undefined;
  let selectedPriority = 0;

  for (const occurrence of concept.occurrences) {
    const priority =
      occurrence.page_index === pageIndex
        ? (CHECKPOINT_ROLE_PRIORITY[occurrence.role] ?? 0)
        : 0;

    if (priority > selectedPriority) {
      selected = occurrence.role as CheckpointSelection["role"];
      selectedPriority = priority;
    }
  }

  return selected;
}

export function transitionLearningLoop(
  state: LearningLoopState,
  result: LearningAttemptResult,
): LearningLoopTransition {
  if (state.phase === "diagnostic") {
    return {
      state: {
        phase: "checkpoint",
        attemptNumber: 1,
      },
      action:
        result === "correct"
          ? "bridge_then_checkpoint"
          : "full_explanation_then_checkpoint",
      resolved: false,
    };
  }

  if (result === "correct") {
    return {
      state: null,
      action: "resolve_correct",
      resolved: true,
    };
  }

  if (state.attemptNumber === 1) {
    return {
      state: {
        phase: state.phase,
        attemptNumber: 2,
      },
      action: "hint_then_retry",
      resolved: false,
    };
  }

  return {
    state: null,
    action: "corrective_feedback_then_resolve",
    resolved: true,
  };
}

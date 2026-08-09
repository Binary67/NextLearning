import type { DocumentModel } from "@/lib/document-model";
import type { TutorialResponse } from "@/lib/tutorial";

export type TutorialAvailability = {
  batchCount: number;
  pageCount: number;
};

export type ProgressiveTutorialResponse = TutorialResponse & {
  sourcePageCount: number;
  availability: TutorialAvailability | null;
};

export type TutorialStatusItem = {
  id: string;
  status: ProgressiveTutorialResponse["status"];
  availability: TutorialAvailability | null;
};

export type TutorialSnapshot = {
  tutorial: ProgressiveTutorialResponse;
  model: DocumentModel;
};

export function isTutorialOpenable(
  tutorial: Pick<ProgressiveTutorialResponse, "availability">,
) {
  return tutorial.availability !== null;
}

export function hasNewerTutorialAvailability(
  currentTutorial: Pick<ProgressiveTutorialResponse, "availability"> | null,
  nextTutorial: Pick<ProgressiveTutorialResponse, "availability">,
) {
  return (
    nextTutorial.availability !== null &&
    nextTutorial.availability.batchCount >
      (currentTutorial?.availability?.batchCount ?? -1)
  );
}

export function haveTutorialAvailabilityChanged(
  previousAvailability: ReadonlyMap<
    string,
    TutorialAvailability | null
  >,
  nextTutorials: readonly TutorialStatusItem[],
) {
  if (previousAvailability.size !== nextTutorials.length) {
    return true;
  }

  return nextTutorials.some((tutorial) => {
    const previous = previousAvailability.get(tutorial.id);

    return (
      previous?.batchCount !== tutorial.availability?.batchCount ||
      previous?.pageCount !== tutorial.availability?.pageCount
    );
  });
}

export function getTutorialAvailabilityLabel(
  tutorial: Pick<
    ProgressiveTutorialResponse,
    "availability" | "sourcePageCount"
  >,
) {
  if (!tutorial.availability) {
    return null;
  }

  return `${tutorial.availability.pageCount} of ${tutorial.sourcePageCount} pages available`;
}

export function getTutorialAvailabilityMessage({
  tutorial,
  currentPage,
  currentPageCount,
  pendingSnapshotReady,
}: {
  tutorial: Pick<
    ProgressiveTutorialResponse,
    "availability" | "sourcePageCount" | "error" | "status"
  >;
  currentPage: number;
  currentPageCount: number;
  pendingSnapshotReady: boolean;
}) {
  const availabilityLabel = getTutorialAvailabilityLabel(tutorial);
  const availability = tutorial.availability;
  const { status } = tutorial;

  if (!availabilityLabel || !availability) {
    return null;
  }

  if (status === "failed") {
    return `${availabilityLabel}. Earlier pages remain available. ${
      tutorial.error ?? "More pages could not be prepared."
    }`;
  }

  if (
    pendingSnapshotReady &&
    currentPage >= currentPageCount
  ) {
    return `A newer section is ready. End the tutor session to continue. ${availabilityLabel}.`;
  }

  if (
    (status === "queued" || status === "processing") &&
    availability.pageCount < tutorial.sourcePageCount
  ) {
    return `${
      currentPage >= currentPageCount
        ? "Preparing the next section"
        : "Preparing more"
    }… ${availabilityLabel}.`;
  }

  return null;
}

export function isTutorialAvailability(
  value: unknown,
): value is TutorialAvailability {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const availability = value as {
    batchCount?: number;
    pageCount?: number;
  };

  return (
    typeof availability.batchCount === "number" &&
    Number.isInteger(availability.batchCount) &&
    availability.batchCount >= 0 &&
    typeof availability.pageCount === "number" &&
    Number.isInteger(availability.pageCount) &&
    availability.pageCount >= 0
  );
}

export function isProgressiveTutorialResponse(
  value: unknown,
): value is ProgressiveTutorialResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const tutorial = value as {
    availability?: TutorialAvailability | null;
    sourcePageCount?: number;
  };

  return (
    typeof tutorial.sourcePageCount === "number" &&
    Number.isInteger(tutorial.sourcePageCount) &&
    tutorial.sourcePageCount >= 0 &&
    (tutorial.availability === null ||
      isTutorialAvailability(tutorial.availability))
  );
}

export function isTutorialSnapshotResponse(
  value: unknown,
): value is TutorialSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as { model?: unknown; tutorial?: unknown };
  const model = snapshot.model;

  if (typeof model !== "object" || model === null) {
    return false;
  }

  const documentModel = model as {
    page_count?: number;
    pages?: unknown;
  };

  return (
    isProgressiveTutorialResponse(snapshot.tutorial) &&
    typeof documentModel.page_count === "number" &&
    Array.isArray(documentModel.pages)
  );
}

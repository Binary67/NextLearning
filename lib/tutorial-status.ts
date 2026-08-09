import type { TutorialStatus } from "@/lib/document-storage-types";
import type { TutorialAvailability } from "@/lib/tutorial";

const tutorialIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TutorialStatusItem = {
  id: string;
  status: TutorialStatus;
  availability: TutorialAvailability | null;
};

export type TutorialStatusResponse = {
  tutorials: TutorialStatusItem[];
};

type CurrentTutorialStatus = TutorialStatus | TutorialStatusItem;

export function isTutorialStatusResponse(
  value: unknown,
): value is TutorialStatusResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const tutorials = (value as { tutorials?: unknown }).tutorials;

  if (!Array.isArray(tutorials)) {
    return false;
  }

  const tutorialIds = new Set<string>();

  for (const tutorial of tutorials) {
    if (
      typeof tutorial !== "object" ||
      tutorial === null ||
      typeof tutorial.id !== "string" ||
      !tutorialIdPattern.test(tutorial.id) ||
      !isTutorialStatus(tutorial.status) ||
      !isTutorialAvailability(tutorial.availability) ||
      tutorialIds.has(tutorial.id)
    ) {
      return false;
    }

    tutorialIds.add(tutorial.id);
  }

  return true;
}

export function haveTutorialStatusesChanged(
  currentStatuses: ReadonlyMap<string, CurrentTutorialStatus>,
  nextTutorials: readonly TutorialStatusItem[],
) {
  if (currentStatuses.size !== nextTutorials.length) {
    return true;
  }

  return nextTutorials.some((tutorial) => {
    const current = currentStatuses.get(tutorial.id);

    if (current === undefined) {
      return true;
    }

    if (typeof current === "string") {
      return current !== tutorial.status;
    }

    return (
      current.status !== tutorial.status ||
      current.availability?.batchCount !==
        tutorial.availability?.batchCount
    );
  });
}

export function hasActiveTutorials(
  tutorials: readonly TutorialStatusItem[],
) {
  return tutorials.some(
    (tutorial) =>
      tutorial.status === "queued" ||
      tutorial.status === "processing",
  );
}

export function countActiveTutorials(
  tutorials: readonly TutorialStatusItem[],
) {
  let queued = 0;
  let processing = 0;

  for (const tutorial of tutorials) {
    if (tutorial.status === "queued") {
      queued += 1;
    } else if (tutorial.status === "processing") {
      processing += 1;
    }
  }

  return { queued, processing };
}

export function getTutorialTransitionMessage(
  previousStatuses: ReadonlyMap<string, CurrentTutorialStatus> | null,
  tutorials: readonly TutorialStatusItem[],
) {
  if (!previousStatuses) {
    return null;
  }

  const completedTutorials = tutorials.filter((tutorial) => {
    const previous = previousStatuses.get(tutorial.id);
    const previousStatus =
      typeof previous === "string" ? previous : previous?.status;

    return (
      (previousStatus === "queued" || previousStatus === "processing") &&
      (tutorial.status === "ready" || tutorial.status === "failed")
    );
  });

  if (completedTutorials.length === 0) {
    return null;
  }

  return completedTutorials.some(
    (tutorial) => tutorial.status === "failed",
  )
    ? "A document could not be prepared. Open the library to retry."
    : "Your document is ready to open.";
}

function isTutorialStatus(value: unknown): value is TutorialStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  );
}

function isTutorialAvailability(
  value: unknown,
): value is TutorialAvailability | null {
  if (value === null) {
    return true;
  }

  if (typeof value !== "object") {
    return false;
  }

  const availability = value as {
    batchCount?: unknown;
    pageCount?: unknown;
  };

  return (
    isPositiveInteger(availability.batchCount) &&
    isPositiveInteger(availability.pageCount)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

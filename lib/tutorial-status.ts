import type { TutorialStatus } from "@/lib/document-storage";

const tutorialIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TutorialStatusItem = {
  id: string;
  status: TutorialStatus;
};

export type TutorialStatusResponse = {
  tutorials: TutorialStatusItem[];
};

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
      tutorialIds.has(tutorial.id)
    ) {
      return false;
    }

    tutorialIds.add(tutorial.id);
  }

  return true;
}

export function haveTutorialStatusesChanged(
  currentStatuses: ReadonlyMap<string, TutorialStatus>,
  nextTutorials: readonly TutorialStatusItem[],
) {
  if (currentStatuses.size !== nextTutorials.length) {
    return true;
  }

  return nextTutorials.some(
    (tutorial) =>
      currentStatuses.get(tutorial.id) !== tutorial.status,
  );
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
  previousStatuses: ReadonlyMap<string, TutorialStatus> | null,
  tutorials: readonly TutorialStatusItem[],
) {
  if (!previousStatuses) {
    return null;
  }

  const completedTutorials = tutorials.filter((tutorial) => {
    const previousStatus = previousStatuses.get(tutorial.id);

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

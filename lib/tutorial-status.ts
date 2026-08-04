import type { TutorialStatus } from "@/lib/document-storage";

export type TutorialStatusItem = {
  id: string;
  status: TutorialStatus;
};

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

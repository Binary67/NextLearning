import { readResponseMessage } from "@/lib/realtime-tutor/transport";
import type { GuidedProgressEvent } from "@/lib/guided-progress";

const guidedProgressQueues = new Map<string, Promise<void>>();

export async function postLearningAttempt(
  tutorialId: string,
  attempt: {
    sessionId: string;
    phase: "diagnostic" | "checkpoint" | "review";
    chunkId: string;
    conceptIds: string[];
    result: "correct" | "partial" | "incorrect";
    confidence: null;
    misconception: string | null;
  },
) {
  await postLearningState(
    `/api/tutorials/${tutorialId}/learning-state/attempts`,
    attempt,
    "This learning attempt could not be saved.",
  );
}

export async function postLearningSession(
  tutorialId: string,
  session: {
    id: string;
    mode: "guided" | "review";
    startedAt: string;
    endedAt: string;
    conceptsPracticed: string[];
  },
) {
  await postLearningState(
    `/api/tutorials/${tutorialId}/learning-state/sessions`,
    session,
    "This session summary could not be saved.",
  );
}

export function postGuidedProgressEvent(
  tutorialId: string,
  event: GuidedProgressEvent,
) {
  const previous =
    guidedProgressQueues.get(tutorialId) ?? Promise.resolve();
  const queued = previous
    .catch(() => {})
    .then(() =>
      postLearningState(
        `/api/tutorials/${tutorialId}/guided-progress`,
        event,
        "Your guided-reading progress could not be saved.",
        true,
      ),
    );

  guidedProgressQueues.set(tutorialId, queued);
  void queued.then(clearQueue, clearQueue);

  return queued;

  function clearQueue() {
    if (guidedProgressQueues.get(tutorialId) === queued) {
      guidedProgressQueues.delete(tutorialId);
    }
  }
}

async function postLearningState(
  url: string,
  body: object,
  fallbackMessage: string,
  keepalive = false,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    keepalive,
  });

  if (response.ok) {
    return;
  }

  const responseBody = await response.text();
  throw new Error(readResponseMessage(responseBody) ?? fallbackMessage);
}

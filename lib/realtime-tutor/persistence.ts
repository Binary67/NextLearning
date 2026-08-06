import { readResponseMessage } from "@/lib/realtime-tutor/transport";

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
    mode: "read" | "guided" | "review";
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

async function postLearningState(
  url: string,
  body: object,
  fallbackMessage: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return;
  }

  const responseBody = await response.text();
  throw new Error(readResponseMessage(responseBody) ?? fallbackMessage);
}

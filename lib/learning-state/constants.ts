export const ATTEMPT_PHASES = [
  "diagnostic",
  "checkpoint",
  "review",
] as const;
export const ATTEMPT_RESULTS = [
  "correct",
  "partial",
  "incorrect",
] as const;
export const LEARNING_STATUSES = [
  "learning",
  "reviewing",
  "mastered",
] as const;
export const SESSION_MODES = ["read", "guided", "review"] as const;

const HOUR_MS = 60 * 60 * 1000;

export const FAILURE_REVIEW_INTERVALS_MS = {
  incorrect: HOUR_MS,
  partial: 6 * HOUR_MS,
} as const;
export const CORRECT_REVIEW_INTERVALS_MS = [
  24 * HOUR_MS,
  3 * 24 * HOUR_MS,
  7 * 24 * HOUR_MS,
  14 * 24 * HOUR_MS,
] as const;
export const MASTERY_CORRECT_COUNT = 3;
export const MAX_MISCONCEPTION_LENGTH = 500;

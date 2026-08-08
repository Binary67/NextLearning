"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./progress.module.css";

export function ResetGuidedProgressButton({
  tutorialId,
  disabled,
}: {
  tutorialId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  async function resetProgress() {
    const confirmed = window.confirm(
      "Reset guided reading? Completed page lessons and the resume position will be cleared. Active Learning mastery, answers, and review history will be kept. This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    setResetting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tutorials/${encodeURIComponent(tutorialId)}/guided-progress`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Your guided-reading progress could not be reset.");
      }

      router.refresh();
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Your guided-reading progress could not be reset.",
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className={styles.resetAction}>
      <button
        className={styles.resetButton}
        type="button"
        onClick={resetProgress}
        disabled={disabled || resetting}
      >
        {resetting ? "Resetting…" : "Reset guided reading"}
      </button>
      {error ? (
        <p className={styles.resetError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

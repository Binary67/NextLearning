"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { DocumentConcept } from "@/lib/document-model";
import type { ConceptLearningState } from "@/lib/learning-state";

import styles from "./progress.module.css";

const reviewDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type ConceptProgressRow = {
  concept: DocumentConcept;
  state: ConceptLearningState | null;
};

export function ProgressDetails({
  tutorialId,
  rows,
  resumePosition,
  lastStudiedAt,
  sessionCount,
}: {
  tutorialId: string;
  rows: ConceptProgressRow[];
  resumePosition: string;
  lastStudiedAt: string | null;
  sessionCount: number;
}) {
  const [nowTimestamp, setNowTimestamp] = useState<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setNowTimestamp(getCurrentTimestamp()),
      0,
    );

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (nowTimestamp === null) {
      return;
    }

    const nextBoundary = getNextReviewTimestamp(rows, nowTimestamp);

    if (nextBoundary === null) {
      return;
    }

    const timeout = window.setTimeout(
      () => setNowTimestamp(getCurrentTimestamp()),
      Math.max(0, nextBoundary - getCurrentTimestamp()),
    );

    return () => window.clearTimeout(timeout);
  }, [nowTimestamp, rows]);

  return (
    <>
      <section className={styles.section}>
        <h2>Concepts</h2>
        <div className={styles.tableScroll}>
          <table className={styles.conceptTable}>
            <thead>
              <tr>
                <th scope="col">Concept</th>
                <th scope="col">Status</th>
                <th scope="col">Streak</th>
                <th scope="col">Last result</th>
                <th scope="col">Next review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.concept.id}>
                  <td>{row.concept.name}</td>
                  <td>{getStatusLabel(row.state)}</td>
                  <td>
                    {row.state ? row.state.consecutiveCorrect : "—"}
                  </td>
                  <td>
                    {row.state
                      ? getResultLabel(row.state.lastResult)
                      : "—"}
                  </td>
                  <td>
                    {isDue(row.state?.nextReviewAt, nowTimestamp) ? (
                      <Link
                        className={styles.reviewLink}
                        href={`/tutorials/${encodeURIComponent(
                          tutorialId,
                        )}?reviewConcept=${encodeURIComponent(
                          row.concept.id,
                        )}`}
                      >
                        Review now
                      </Link>
                    ) : row.state?.nextReviewAt ? (
                      <LocalTime
                        dateTime={row.state.nextReviewAt}
                        mounted={nowTimestamp !== null}
                      />
                    ) : row.state ? (
                      "Not scheduled"
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <dl className={styles.footerStats}>
        <div>
          <dt>Resume position</dt>
          <dd>{resumePosition}</dd>
        </div>
        <div>
          <dt>Last studied</dt>
          <dd>
            {lastStudiedAt ? (
              <LocalTime
                dateTime={lastStudiedAt}
                mounted={nowTimestamp !== null}
              />
            ) : (
              "Never"
            )}
          </dd>
        </div>
        <div>
          <dt>Sessions</dt>
          <dd>{sessionCount}</dd>
        </div>
      </dl>
    </>
  );
}

function LocalTime({
  dateTime,
  mounted,
}: {
  dateTime: string;
  mounted: boolean;
}) {
  return (
    <time dateTime={dateTime}>
      {mounted ? reviewDateFormatter.format(new Date(dateTime)) : ""}
    </time>
  );
}

function getNextReviewTimestamp(
  rows: ConceptProgressRow[],
  nowTimestamp: number,
) {
  let nextBoundary = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    if (!row.state?.nextReviewAt) {
      continue;
    }

    const reviewTimestamp = Date.parse(row.state.nextReviewAt);

    if (
      reviewTimestamp > nowTimestamp &&
      reviewTimestamp < nextBoundary
    ) {
      nextBoundary = reviewTimestamp;
    }
  }

  return Number.isFinite(nextBoundary) ? nextBoundary : null;
}

function isDue(
  nextReviewAt: string | null | undefined,
  nowTimestamp: number | null,
) {
  return (
    nextReviewAt !== null &&
    nextReviewAt !== undefined &&
    nowTimestamp !== null &&
    Date.parse(nextReviewAt) <= nowTimestamp
  );
}

function getStatusLabel(state: ConceptLearningState | null) {
  if (!state) {
    return "Not practiced";
  }

  switch (state.status) {
    case "mastered":
      return "Mastered";
    case "reviewing":
      return "Reviewing";
    case "learning":
      return "Learning";
  }
}

function getResultLabel(result: ConceptLearningState["lastResult"]) {
  switch (result) {
    case "correct":
      return "Correct";
    case "partial":
      return "Partial";
    case "incorrect":
      return "Incorrect";
  }
}

function getCurrentTimestamp() {
  return Date.now();
}

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

type ConceptFilter =
  | "practiced"
  | "attention"
  | "not-practiced"
  | "all";

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
  const [filter, setFilter] = useState<ConceptFilter>("practiced");
  const practicedRows = rows.filter((row) => row.state !== null);
  const attentionRows = practicedRows.filter(
    (row) =>
      row.state?.misconception !== null ||
      row.state.lastResult !== "correct",
  );
  const notPracticedRows = rows.filter((row) => row.state === null);
  const filteredRows =
    filter === "practiced"
      ? practicedRows
      : filter === "attention"
        ? attentionRows
        : filter === "not-practiced"
          ? notPracticedRows
          : rows;

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
      <section
        className={styles.conceptSection}
        aria-labelledby="concept-progress-title"
      >
        <div className={styles.conceptHeading}>
          <div>
            <h3 id="concept-progress-title">Concept progress</h3>
            <p>
              Listening to a lesson does not count as concept practice.
            </p>
          </div>
          <div
            className={styles.conceptFilters}
            role="group"
            aria-label="Filter concepts"
          >
            <button
              type="button"
              aria-pressed={filter === "practiced"}
              onClick={() => setFilter("practiced")}
            >
              Practiced ({practicedRows.length})
            </button>
            <button
              type="button"
              aria-pressed={filter === "attention"}
              onClick={() => setFilter("attention")}
            >
              Needs attention ({attentionRows.length})
            </button>
            <button
              type="button"
              aria-pressed={filter === "not-practiced"}
              onClick={() => setFilter("not-practiced")}
            >
              Not practiced ({notPracticedRows.length})
            </button>
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All ({rows.length})
            </button>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <p className={styles.filterEmptyState}>
            {filter === "practiced"
              ? "No concepts have been practiced yet."
              : filter === "attention"
                ? "No practiced concepts currently need attention."
                : "No concepts match this filter."}
          </p>
        ) : (
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
                {filteredRows.map((row) => (
                  <tr key={row.concept.id}>
                    <td>{row.concept.name}</td>
                    <td>{getStatusLabel(row.state)}</td>
                    <td>
                      {row.state
                        ? row.state.consecutiveCorrect
                        : "—"}
                    </td>
                    <td>
                      {row.state
                        ? getResultLabel(row.state.lastResult)
                        : "—"}
                    </td>
                    <td>
                      {isDue(
                        row.state?.nextReviewAt,
                        nowTimestamp,
                      ) ? (
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
        )}
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

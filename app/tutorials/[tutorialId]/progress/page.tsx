import Link from "next/link";

import type { DocumentConcept } from "@/lib/document-model";
import { isTutorialId } from "@/lib/document-storage";
import { summarizeLearningProgress } from "@/lib/learning-progress";
import type {
  ConceptLearningState,
  LearningState,
} from "@/lib/learning-state";
import { readLearningState } from "@/lib/learning-state-store";
import {
  type PreparedTutorial,
  readPreparedTutorial,
} from "@/lib/tutorial";

import styles from "./progress.module.css";

const reviewDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
  timeStyle: "short",
});

type ConceptProgressRow = {
  concept: DocumentConcept;
  state: ConceptLearningState | null;
  due: boolean;
};

export default async function TutorialProgressPage({
  params,
}: {
  params: Promise<{ tutorialId: string }>;
}) {
  const { tutorialId } = await params;
  let error = "";
  let prepared: PreparedTutorial | null = null;
  let learningState: LearningState | null = null;

  if (isTutorialId(tutorialId)) {
    try {
      prepared = await readPreparedTutorial(tutorialId);

      if (prepared) {
        learningState = await readLearningState(
          tutorialId,
          prepared.model,
        );
      }
    } catch (loadError) {
      console.error("Learning progress could not be loaded:", loadError);
      error = "Your learning progress could not be loaded.";
    }
  }

  if (!prepared || !learningState) {
    return (
      <main className={styles.main}>
        <section className={styles.content}>
          <header className={styles.heading}>
            <h1>Progress</h1>
          </header>
          <p className={styles.emptyState} role="alert">
            {error || "That document is not available."}
          </p>
        </section>
      </main>
    );
  }

  const now = new Date();
  const nowTimestamp = now.getTime();
  const model = prepared.model;
  const conceptStates = learningState.concepts;
  const sessions = learningState.sessions;
  const resume = learningState.resume;
  const summary = summarizeLearningProgress(model, learningState, now);
  const rows: ConceptProgressRow[] = model.concepts.map((concept) => {
    const state = conceptStates[concept.id] ?? null;

    return {
      concept,
      state,
      due:
        state !== null &&
        state.nextReviewAt !== null &&
        Date.parse(state.nextReviewAt) <= nowTimestamp,
    };
  });
  const weakRows = rows.filter(
    (row): row is ConceptProgressRow & { state: ConceptLearningState } =>
      row.state !== null &&
      (row.state.misconception !== null ||
        row.state.lastResult !== "correct"),
  );
  const resumePage = resume
    ? model.pages.find((page) => page.page_index === resume.pageIndex)
    : null;
  const lastSession =
    sessions.length > 0 ? sessions[sessions.length - 1] : null;

  return (
    <main className={styles.main}>
      <section
        className={styles.content}
        aria-labelledby="progress-title"
      >
        <header className={styles.heading}>
          <p className={styles.documentTitle}>
            {prepared.tutorial.title}
          </p>
          <h1 id="progress-title">Progress</h1>
          <p>
            See what you have practiced, what needs attention, and
            what is due for review.
          </p>
        </header>

        <section className={styles.section} aria-label="Mastery breakdown">
          <dl className={styles.summaryGrid}>
            <div>
              <dt>Mastered</dt>
              <dd>{summary.mastered}</dd>
            </div>
            <div>
              <dt>Reviewing</dt>
              <dd>{summary.reviewing}</dd>
            </div>
            <div>
              <dt>Learning</dt>
              <dd>{summary.learning}</dd>
            </div>
            <div>
              <dt>Not practiced</dt>
              <dd>{summary.notPracticed}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section}>
          <h2>Needs attention</h2>
          {weakRows.length === 0 ? (
            <p className={styles.emptyState}>
              No weak points identified.
            </p>
          ) : (
            <ul className={styles.weakList}>
              {weakRows.map((row) => (
                <li key={row.concept.id} className={styles.weakItem}>
                  <h3>{row.concept.name}</h3>
                  <p className={styles.weakMeta}>
                    Last result: {getResultLabel(row.state.lastResult)}
                  </p>
                  {row.state.misconception && (
                    <p className={styles.misconceptionText}>
                      {row.state.misconception}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

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
                    <td>{row.state ? row.state.consecutiveCorrect : "—"}</td>
                    <td>
                      {row.state
                        ? getResultLabel(row.state.lastResult)
                        : "—"}
                    </td>
                    <td>
                      {row.due ? (
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
                        <time dateTime={row.state.nextReviewAt}>
                          {reviewDateFormatter.format(
                            new Date(row.state.nextReviewAt),
                          )}
                        </time>
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
            <dd>
              {resume
                ? `Page ${resumePage?.page_label ?? resume.pageIndex}`
                : "None"}
            </dd>
          </div>
          <div>
            <dt>Last studied</dt>
            <dd>
              {lastSession ? (
                <time dateTime={lastSession.endedAt}>
                  {reviewDateFormatter.format(
                    new Date(lastSession.endedAt),
                  )}
                </time>
              ) : (
                "Never"
              )}
            </dd>
          </div>
          <div>
            <dt>Sessions</dt>
            <dd>{sessions.length}</dd>
          </div>
        </dl>
      </section>
    </main>
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

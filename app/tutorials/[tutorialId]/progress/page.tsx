import Link from "next/link";

import { isTutorialId } from "@/lib/document-storage";
import {
  summarizeGuidedProgress,
} from "@/lib/guided-progress";
import { readGuidedProgress } from "@/lib/guided-progress-store";
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
import { ProgressDetails } from "./progress-details";

type ConceptProgressRow = {
  concept: PreparedTutorial["model"]["concepts"][number];
  state: ConceptLearningState | null;
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
  const model = prepared.model;
  const conceptStates = learningState.concepts;
  const sessions = learningState.sessions;
  const resume = learningState.resume;
  const summary = summarizeLearningProgress(model, learningState, now);
  const hasConceptPractice = summary.practiced > 0;
  const guidedProgress = await readGuidedProgress(tutorialId, model);
  const guidedSummary = summarizeGuidedProgress(
    model,
    guidedProgress,
  );
  const rows: ConceptProgressRow[] = model.concepts.map((concept) => {
    const state = conceptStates[concept.id] ?? null;

    return {
      concept,
      state,
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
  const guidedCursor = guidedProgress.cursor;
  const guidedCursorPage = guidedCursor
    ? model.pages[guidedCursor.pageIndex - 1]
    : null;
  const guidedCursorChunk = guidedCursor
    ? guidedCursorPage?.chunks.find(
        (chunk) => chunk.id === guidedCursor.chunkId,
      )
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
            Track completed page lessons separately from concepts
            practiced through questions.
          </p>
        </header>

        <section
          className={`${styles.section} ${styles.trackCard}`}
          aria-labelledby="guided-progress-title"
        >
          <div className={styles.guidedHeading}>
            <div>
              <h2 id="guided-progress-title">Guided reading</h2>
              <p className={styles.trackDescription}>
                Tracks page lessons completed in Guided Reading or
                Active Learning. Completing a lesson does not mark its
                concepts as practiced.
              </p>
              <p>
                {guidedSummary.completedChunks} of{" "}
                {guidedSummary.totalChunks} page lessons completed
              </p>
            </div>
            <strong>{guidedSummary.percentage}%</strong>
          </div>
          <div
            className={styles.guidedTrack}
            role="progressbar"
            aria-label="Page lesson completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={guidedSummary.percentage}
          >
            <span
              style={{ width: `${guidedSummary.percentage}%` }}
            />
          </div>
          <div className={styles.guidedFooter}>
            <p>
              {guidedCursor
                ? `Continue on page ${
                    guidedCursorPage?.page_label ??
                    guidedCursor.pageIndex
                  }${guidedCursorChunk ? `: ${guidedCursorChunk.title}` : ""}`
                : guidedSummary.totalChunks > 0 &&
                    guidedSummary.completedChunks ===
                      guidedSummary.totalChunks
                  ? "Guided reading complete"
                  : "Start guided reading from the beginning"}
            </p>
            <Link
              className={styles.continueLink}
              href={`/tutorials/${encodeURIComponent(
                tutorialId,
              )}`}
            >
              {guidedCursor ? "Continue reading" : "Open guided reading"}
            </Link>
          </div>
        </section>

        <section
          className={`${styles.section} ${styles.trackCard}`}
          aria-labelledby="active-learning-title"
        >
          <div className={styles.activeHeading}>
            <div>
              <h2 id="active-learning-title">Active learning</h2>
              <p className={styles.trackDescription}>
                Tracks concepts you practice by answering questions in
                Active Learning or Review.
              </p>
              <p className={styles.activeCount}>
                {summary.practiced} of {summary.total} concepts practiced
              </p>
            </div>
            <Link
              className={styles.continueLink}
              href={`/tutorials/${encodeURIComponent(tutorialId)}`}
            >
              {hasConceptPractice
                ? "Continue active learning"
                : "Start active learning"}
            </Link>
          </div>

          {hasConceptPractice ? (
            <>
              <dl
                className={styles.summaryGrid}
                aria-label="Active learning mastery breakdown"
              >
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

              <section
                className={styles.activeSubsection}
                aria-labelledby="needs-attention-title"
              >
                <h3 id="needs-attention-title">Needs attention</h3>
                {weakRows.length === 0 ? (
                  <p className={styles.emptyState}>
                    No practiced concepts currently need attention.
                  </p>
                ) : (
                  <ul className={styles.weakList}>
                    {weakRows.map((row) => (
                      <li
                        key={row.concept.id}
                        className={styles.weakItem}
                      >
                        <h4>{row.concept.name}</h4>
                        <p className={styles.weakMeta}>
                          Last result:{" "}
                          {getResultLabel(row.state.lastResult)}
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
            </>
          ) : (
            <div className={styles.learningEmptyState}>
              <strong>No concepts practiced yet</strong>
              <p>
                {summary.total} concepts are available to practice.
                Answer questions in Active Learning to begin measuring
                your understanding.
              </p>
            </div>
          )}

          <ProgressDetails
            tutorialId={tutorialId}
            rows={rows}
            resumePosition={
              guidedCursor
                ? `Page ${
                    guidedCursorPage?.page_label ??
                    guidedCursor.pageIndex
                  }`
                : resume
                  ? `Page ${resumePage?.page_label ?? resume.pageIndex}`
                : "None"
            }
            lastStudiedAt={lastSession?.endedAt ?? null}
            sessionCount={sessions.length}
          />
        </section>
      </section>
    </main>
  );
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

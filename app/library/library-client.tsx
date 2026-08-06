"use client";

import {
  ArrowRight,
  BarChart2,
  BookOpen,
  FileText,
  LibraryBig,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useApplicationShell } from "@/app/application-shell";
import { NewTutorialButton } from "@/app/new-tutorial-button";
import type { TutorialResponse } from "@/lib/tutorial";

const updatedAtFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export function LibraryClient({
  initialTutorials,
  initialError,
}: {
  initialTutorials: TutorialResponse[];
  initialError: string;
}) {
  const {
    tutorials: sharedTutorials,
    tutorialRevision,
    addTutorial,
    updateTutorial,
    removeTutorial,
    showToast,
  } = useApplicationShell();
  const tutorials = mergeTutorialData(
    initialTutorials,
    sharedTutorials,
  );
  const error = tutorialRevision === 0 ? initialError : "";
  const [tutorialToDelete, setTutorialToDelete] =
    useState<TutorialResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  function addQueuedTutorial(tutorial: TutorialResponse) {
    addTutorial(tutorial);
    showToast("Document added to the preparation queue.");
  }

  async function retryTutorial(tutorial: TutorialResponse) {
    try {
      const response = await fetch(`/api/tutorials/${tutorial.id}`, {
        method: "PATCH",
      });
      const data = (await response.json()) as {
        tutorial?: TutorialResponse;
        message?: string;
      };

      if (!response.ok || !data.tutorial) {
        throw new Error(data.message ?? "The document could not be retried.");
      }

      const retriedTutorial = data.tutorial;
      updateTutorial(retriedTutorial);
      showToast("Document returned to the preparation queue.");
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : "The document could not be retried.",
      );
    }
  }

  async function deleteTutorial() {
    if (!tutorialToDelete) {
      return;
    }

    const tutorialId = tutorialToDelete.id;
    setDeleting(true);

    try {
      const response = await fetch(
        `/api/tutorials/${tutorialId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("The document could not be deleted.");
      }

      removeTutorial(tutorialId);
      setTutorialToDelete(null);
      showToast("Document deleted.");
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : "The document could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <main className="library-main">
        <section className="library-content" aria-labelledby="library-title">
          <header className="library-heading">
            <div>
              <h1 id="library-title">Library</h1>
              <p>Your documents, ready to read and discuss.</p>
            </div>
            {tutorials.length > 0 && (
              <NewTutorialButton onQueued={addQueuedTutorial} />
            )}
          </header>

          {error ? (
            <div className="library-state">
              <LibraryBig size={34} aria-hidden="true" />
              <h2>Library unavailable</h2>
              <p role="alert">{error}</p>
            </div>
          ) : tutorials.length === 0 ? (
            <div className="library-state library-empty">
              <span className="library-state-icon">
                <BookOpen size={28} aria-hidden="true" />
              </span>
              <h2>No documents yet</h2>
              <p>Choose a PDF, select any region, and ask questions by voice.</p>
              <NewTutorialButton onQueued={addQueuedTutorial} />
            </div>
          ) : (
            <div className="tutorial-grid">
              {tutorials.map((tutorial) => (
                <TutorialCard
                  key={tutorial.id}
                  tutorial={tutorial}
                  onDelete={() => setTutorialToDelete(tutorial)}
                  onRetry={() => retryTutorial(tutorial)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {tutorialToDelete && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-tutorial-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setTutorialToDelete(null)}
              disabled={deleting}
              aria-label="Close dialog"
            >
              <X size={22} />
            </button>
            <div className="modal-icon danger">
              <Trash2 size={23} />
            </div>
            <p className="modal-eyebrow">Document management</p>
            <h2 id="delete-tutorial-title">Delete this document?</h2>
            <p className="modal-copy">
              <strong>{tutorialToDelete.title}</strong> and its source PDF,
              document model, and any prepared reading context will be
              permanently deleted from this machine.
            </p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setTutorialToDelete(null)}
                disabled={deleting}
              >
                Keep Document
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                onClick={deleteTutorial}
                disabled={deleting}
              >
                <Trash2 size={19} />
                {deleting ? "Deleting…" : "Delete Document"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function TutorialCard({
  tutorial,
  onDelete,
  onRetry,
}: {
  tutorial: TutorialResponse;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const map = tutorial.status === "ready" ? tutorial.map : null;
  const ready = map !== null;
  const canDelete = ready || tutorial.status === "failed";
  const content = (
    <>
      <div className="tutorial-card-heading">
        <span className="tutorial-file-icon">
          <FileText size={22} aria-hidden="true" />
        </span>
        <span
          className={`tutorial-card-status ${tutorial.status}`}
        >
          {getTutorialStatusLabel(tutorial.status)}
        </span>
      </div>
      <h2>{tutorial.title}</h2>
      <p className="tutorial-document-name">{tutorial.documentName}</p>
      {ready ? (
        <>
          <dl className="tutorial-metrics">
            <div>
              <dt>Pages</dt>
              <dd>{map.page_count}</dd>
            </div>
            <div>
              <dt>Concepts</dt>
              <dd>{map.concept_count}</dd>
            </div>
            <div>
              <dt>Connections</dt>
              <dd>{map.connection_count}</dd>
            </div>
          </dl>
          {tutorial.learningSummary && (
            <dl className="tutorial-learning-metrics">
              <div>
                <dt>Practiced</dt>
                <dd>
                  {tutorial.learningSummary.practiced}/
                  {tutorial.learningSummary.total}
                </dd>
              </div>
              <div>
                <dt>Mastered</dt>
                <dd>{tutorial.learningSummary.mastered}</dd>
              </div>
              <div>
                <dt>Due now</dt>
                <dd>{tutorial.learningSummary.dueNow}</dd>
              </div>
            </dl>
          )}
        </>
      ) : (
        <div className="tutorial-preparation-state">
          <p>{getTutorialStatusMessage(tutorial)}</p>
        </div>
      )}
      <div className="tutorial-card-footer">
        <span>{formatUpdatedAt(tutorial.createdAt)}</span>
        {ready && (
          <strong>
            Open
            <ArrowRight size={15} aria-hidden="true" />
          </strong>
        )}
        {tutorial.status === "failed" && (
          <button
            className="tutorial-retry-button"
            type="button"
            onClick={onRetry}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        )}
      </div>
    </>
  );

  return (
    <article
      className={`tutorial-card${ready ? " tutorial-card-has-progress" : ""}`}
    >
      {ready ? (
        <Link
          className="tutorial-card-content"
          href={`/tutorials/${tutorial.id}`}
        >
          {content}
        </Link>
      ) : (
        <div className="tutorial-card-content">{content}</div>
      )}
      {ready && (
        <Link
          className="tutorial-progress-link"
          href={`/tutorials/${tutorial.id}/progress`}
          aria-label={`View progress for ${tutorial.title}`}
        >
          <BarChart2 size={15} aria-hidden="true" />
          Progress
        </Link>
      )}
      {canDelete && (
        <button
          className="tutorial-delete-button"
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${tutorial.title}`}
        >
          <Trash2 size={17} />
        </button>
      )}
    </article>
  );
}

function getTutorialStatusLabel(status: TutorialResponse["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Preparing";
    case "ready":
      return "Ready to read";
    case "failed":
      return "Failed";
  }
}

function getTutorialStatusMessage(tutorial: TutorialResponse) {
  switch (tutorial.status) {
    case "queued":
      return "Waiting for earlier documents to finish.";
    case "processing":
      return "Mapping concepts and preparing reading context.";
    case "failed":
      return tutorial.error ?? "The document could not be prepared.";
    case "ready":
      return "";
  }
}

function formatUpdatedAt(updatedAt: string) {
  return updatedAtFormatter.format(new Date(updatedAt));
}

function mergeTutorialData(
  initialTutorials: TutorialResponse[],
  sharedTutorials: TutorialResponse[],
) {
  const initialById = new Map(
    initialTutorials.map((tutorial) => [tutorial.id, tutorial]),
  );
  const sharedIds = new Set(
    sharedTutorials.map((tutorial) => tutorial.id),
  );
  const tutorials = sharedTutorials.map((tutorial) => {
    const initialTutorial = initialById.get(tutorial.id);

    return tutorial.status === "ready" &&
      (tutorial.map === null || tutorial.learningSummary === null) &&
      initialTutorial?.status === "ready"
      ? initialTutorial
      : tutorial;
  });

  for (const tutorial of initialTutorials) {
    if (!sharedIds.has(tutorial.id)) {
      tutorials.push(tutorial);
    }
  }

  return tutorials.sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}

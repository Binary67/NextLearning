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
import { useEffect, useRef, useState } from "react";

import { useApplicationShell } from "@/app/application-shell";
import { NewTutorialButton } from "@/app/new-tutorial-button";
import {
  getTutorialAvailabilityLabel,
  isTutorialOpenable,
  type ProgressiveTutorialResponse,
} from "@/app/tutorial-progressive";

const BOUNDARY_REFRESH_RETRY_MS = 60_000;

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
  initialTutorials: ProgressiveTutorialResponse[];
  initialError: string;
}) {
  const {
    tutorials: sharedTutorials,
    tutorialRevision,
    addTutorial,
    updateTutorial,
    removeTutorial,
    refreshTutorials,
    showToast,
  } = useApplicationShell();
  const tutorials = mergeTutorialData(
    initialTutorials,
    sharedTutorials,
  );
  const error = tutorialRevision === 0 ? initialError : "";
  const [tutorialToDelete, setTutorialToDelete] =
    useState<ProgressiveTutorialResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const refreshedBoundaryRef = useRef<string | null>(null);
  const nextReviewAt = getNextReviewAt(tutorials);

  useEffect(() => {
    if (!nextReviewAt) {
      return;
    }

    const boundaryTimestamp = Date.parse(nextReviewAt);

    if (
      !Number.isFinite(boundaryTimestamp) ||
      (refreshedBoundaryRef.current === nextReviewAt &&
        boundaryTimestamp <= getCurrentTimestamp())
    ) {
      return;
    }

    let cancelled = false;
    let refreshTimeout = window.setTimeout(
      refreshAtBoundary,
      Math.max(0, boundaryTimestamp - getCurrentTimestamp()),
    );

    async function refreshAtBoundary() {
      const refreshed = await refreshTutorials();

      if (cancelled) {
        return;
      }

      if (refreshed) {
        refreshedBoundaryRef.current = nextReviewAt;
      } else {
        refreshTimeout = window.setTimeout(
          refreshAtBoundary,
          BOUNDARY_REFRESH_RETRY_MS,
        );
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimeout);
    };
  }, [nextReviewAt, refreshTutorials]);

  function addQueuedTutorial(tutorial: ProgressiveTutorialResponse) {
    addTutorial(tutorial);
    showToast("Document added to the preparation queue.");
  }

  async function retryTutorial(tutorial: ProgressiveTutorialResponse) {
    try {
      const response = await fetch(`/api/tutorials/${tutorial.id}`, {
        method: "PATCH",
      });
      const data = (await response.json()) as {
        tutorial?: ProgressiveTutorialResponse;
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
  tutorial: ProgressiveTutorialResponse;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const map = tutorial.map;
  const openable = isTutorialOpenable(tutorial);
  const availabilityLabel = getTutorialAvailabilityLabel(tutorial);
  const canDelete = openable || tutorial.status === "failed";
  const content = (
    <>
      <div className="tutorial-card-heading">
        <span className="tutorial-file-icon">
          <FileText size={22} aria-hidden="true" />
        </span>
        <span
          className={`tutorial-card-status ${tutorial.status}`}
        >
          {getTutorialStatusLabel(tutorial)}
        </span>
      </div>
      <h2>{tutorial.title}</h2>
      <p className="tutorial-document-name">{tutorial.documentName}</p>
      {openable ? (
        <>
          <dl className="tutorial-metrics">
            <div>
              <dt>Pages available</dt>
              <dd>{availabilityLabel}</dd>
            </div>
            {map ? (
              <>
                <div>
                  <dt>Concepts</dt>
                  <dd>{map.concept_count}</dd>
                </div>
                <div>
                  <dt>Connections</dt>
                  <dd>{map.connection_count}</dd>
                </div>
              </>
            ) : null}
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
        {openable && (
          <div className="tutorial-card-actions">
            <Link
              className="tutorial-card-action tutorial-progress-link"
              href={`/tutorials/${tutorial.id}/progress`}
              aria-label={`View progress for ${tutorial.title}`}
            >
              <BarChart2 size={15} aria-hidden="true" />
              Progress
            </Link>
            <Link
              className="tutorial-card-action tutorial-open-link"
              href={`/tutorials/${tutorial.id}`}
              aria-label={`Open reader for ${tutorial.title}`}
            >
              Open reader
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
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
    <article className="tutorial-card">
      <div className="tutorial-card-content">{content}</div>
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

function getTutorialStatusLabel(
  tutorial: Pick<ProgressiveTutorialResponse, "status" | "availability">,
) {
  const { status } = tutorial;

  switch (status) {
    case "queued":
      return tutorial.availability ? "Preparing more" : "Queued";
    case "processing":
      return tutorial.availability ? "Preparing more" : "Preparing";
    case "ready":
      return "Ready to read";
    case "failed":
      return tutorial.availability ? "Available · failed" : "Failed";
  }
}

function getTutorialStatusMessage(tutorial: ProgressiveTutorialResponse) {
  const availabilityLabel = getTutorialAvailabilityLabel(tutorial);

  switch (tutorial.status) {
    case "queued":
      return availabilityLabel
        ? `Preparing more. ${availabilityLabel}.`
        : "Waiting for earlier documents to finish.";
    case "processing":
      return availabilityLabel
        ? `Preparing more. ${availabilityLabel}.`
        : "Mapping concepts and preparing reading context.";
    case "failed":
      return availabilityLabel
        ? `${availabilityLabel}. Earlier pages remain available. ${
            tutorial.error ?? "More pages could not be prepared."
          }`
        : tutorial.error ?? "The document could not be prepared.";
    case "ready":
      return "";
  }
}

function formatUpdatedAt(updatedAt: string) {
  return updatedAtFormatter.format(new Date(updatedAt));
}

function mergeTutorialData(
  initialTutorials: ProgressiveTutorialResponse[],
  sharedTutorials: ProgressiveTutorialResponse[],
) {
  const initialById = new Map(
    initialTutorials.map((tutorial) => [tutorial.id, tutorial]),
  );
  const sharedIds = new Set(
    sharedTutorials.map((tutorial) => tutorial.id),
  );
  const tutorials = sharedTutorials.map((tutorial) => {
    const initialTutorial = initialById.get(tutorial.id);

    return isTutorialOpenable(tutorial) &&
      (tutorial.map === null || tutorial.learningSummary === null) &&
      initialTutorial &&
      isTutorialOpenable(initialTutorial)
      ? {
          ...initialTutorial,
          ...tutorial,
          map: tutorial.map ?? initialTutorial.map,
          learningSummary:
            tutorial.learningSummary ?? initialTutorial.learningSummary,
        }
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

function getNextReviewAt(tutorials: ProgressiveTutorialResponse[]) {
  let nextReviewTimestamp = Number.POSITIVE_INFINITY;
  let nextReviewAt: string | null = null;

  for (const tutorial of tutorials) {
    const candidate = tutorial.learningSummary?.nextReviewAt;

    if (!candidate) {
      continue;
    }

    const candidateTimestamp = Date.parse(candidate);

    if (candidateTimestamp < nextReviewTimestamp) {
      nextReviewTimestamp = candidateTimestamp;
      nextReviewAt = candidate;
    }
  }

  return nextReviewAt;
}

function getCurrentTimestamp() {
  return Date.now();
}

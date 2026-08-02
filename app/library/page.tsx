"use client";

import {
  ArrowRight,
  BookOpen,
  FileText,
  LibraryBig,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppHeader } from "@/app/app-header";
import { LearningSettingsDialog } from "@/app/learning-settings";
import { NewTutorialButton } from "@/app/new-tutorial-button";
import type { TutorialResponse } from "@/lib/tutorial";

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const LIBRARY_REFRESH_INTERVAL_MS = 3000;

export default function LibraryPage() {
  const [tutorials, setTutorials] = useState<TutorialResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialToDelete, setTutorialToDelete] =
    useState<TutorialResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const latestReadyTutorial = tutorials.find(
    (tutorial) => tutorial.status === "ready",
  );
  const dashboardHref = latestReadyTutorial
    ? `/tutorials/${latestReadyTutorial.id}`
    : null;

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimeout: number | undefined;
    let initialLoad = true;

    async function loadTutorials() {
      try {
        const response = await fetch("/api/tutorials", {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          tutorials?: TutorialResponse[];
          message?: string;
        };

        if (!response.ok || !data.tutorials) {
          throw new Error(data.message ?? "Your documents could not be loaded.");
        }

        setTutorials(data.tutorials);
        setError("");
      } catch (reason) {
        if (
          initialLoad &&
          reason instanceof Error &&
          reason.name !== "AbortError"
        ) {
          setError(reason.message);
        }
      } finally {
        if (initialLoad && !controller.signal.aborted) {
          setLoading(false);
        }

        initialLoad = false;

        if (!controller.signal.aborted) {
          refreshTimeout = window.setTimeout(
            loadTutorials,
            LIBRARY_REFRESH_INTERVAL_MS,
          );
        }
      }
    }

    loadTutorials();
    return () => {
      controller.abort();
      window.clearTimeout(refreshTimeout);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function addQueuedTutorial(tutorial: TutorialResponse) {
    setTutorials((currentTutorials) => [
      tutorial,
      ...currentTutorials.filter(
        (currentTutorial) => currentTutorial.id !== tutorial.id,
      ),
    ]);
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
      setTutorials((currentTutorials) =>
        currentTutorials.map((currentTutorial) =>
          currentTutorial.id === retriedTutorial.id
            ? retriedTutorial
            : currentTutorial,
        ),
      );
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

      setTutorials((currentTutorials) =>
        currentTutorials.filter(
          (tutorial) => tutorial.id !== tutorialId,
        ),
      );
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
    <div className="app-shell library-shell">
      <AppHeader
        activeSection="library"
        dashboardHref={dashboardHref}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onShowMessage={showToast}
      />

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

          {loading ? (
            <div className="library-state" aria-live="polite">
              <LibraryBig size={34} aria-hidden="true" />
              <h2>Loading your documents…</h2>
            </div>
          ) : error ? (
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

      {settingsOpen && (
        <LearningSettingsDialog
          onClose={() => setSettingsOpen(false)}
          onShowMessage={showToast}
        />
      )}

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

      <div className={`toast${toast ? " visible" : ""}`} aria-live="polite">
        {toast}
      </div>
    </div>
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
    <article className="tutorial-card">
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

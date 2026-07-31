"use client";

import {
  ArrowRight,
  BookOpen,
  FileText,
  LibraryBig,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { NewTutorialButton } from "@/app/new-tutorial-button";
import type { TutorialResponse } from "@/lib/tutorial";

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default function LibraryPage() {
  const [tutorials, setTutorials] = useState<TutorialResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tutorialToDelete, setTutorialToDelete] =
    useState<TutorialResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dashboardHref = tutorials[0]
    ? `/tutorials/${tutorials[0].id}`
    : "/library";

  useEffect(() => {
    const controller = new AbortController();

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
          throw new Error(data.message ?? "Your tutorials could not be loaded.");
        }

        setTutorials(data.tutorials);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setError(reason.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadTutorials();
    return () => controller.abort();
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
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
        throw new Error("The tutorial could not be deleted.");
      }

      setTutorials((currentTutorials) =>
        currentTutorials.filter(
          (tutorial) => tutorial.id !== tutorialId,
        ),
      );
      setTutorialToDelete(null);
      showToast("Tutorial deleted.");
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : "The tutorial could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="app-shell library-shell">
      <header className="topbar">
        <div className="brand-group">
          <Link className="brand" href="/library" aria-label="NextLearning home">
            <span className="brand-mark" aria-hidden="true">
              N
            </span>
            NextLearning
          </Link>
        </div>

        <nav className="main-nav" aria-label="Primary navigation">
          <Link className="nav-link" href={dashboardHref}>
            Dashboard
          </Link>
          <button
            className="nav-link"
            type="button"
            onClick={() =>
              showToast("Courses are ready for future learning paths.")
            }
          >
            Courses
          </button>
          <Link
            className="nav-link active"
            href="/library"
            aria-current="page"
          >
            Library
          </Link>
        </nav>

        <div className="header-actions">
          <button
            className="avatar"
            type="button"
            onClick={() => showToast("Profile selected.")}
            aria-label="Open profile"
          >
            AM
          </button>
        </div>
      </header>

      <section className="library-content" aria-labelledby="library-title">
        <header className="library-heading">
          <div>
            <p className="library-eyebrow">Your learning space</p>
            <h1 id="library-title">Tutorial Library</h1>
            <p>
              Pick up where you left off or prepare a new PDF as its own
              guided tutorial.
            </p>
          </div>
          <NewTutorialButton />
        </header>

        {loading ? (
          <div className="library-state" aria-live="polite">
            <LibraryBig size={34} aria-hidden="true" />
            <h2>Loading your tutorials…</h2>
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
              <BookOpen size={31} aria-hidden="true" />
            </span>
            <p className="library-eyebrow">Begin a new subject</p>
            <h2>Your tutorial library is empty</h2>
            <p>
              Use New Tutorial to upload a PDF. Each tutorial keeps its own
              teaching plan and learning progress.
            </p>
          </div>
        ) : (
          <div className="tutorial-grid">
            {tutorials.map((tutorial) => {
              const progress =
                tutorial.masteredUnitCount / tutorial.plan.unit_count;

              return (
                <article className="tutorial-card" key={tutorial.id}>
                  <Link
                    className="tutorial-card-content"
                    href={`/tutorials/${tutorial.id}`}
                  >
                    <div className="tutorial-card-heading">
                      <span className="tutorial-file-icon">
                        <FileText size={22} aria-hidden="true" />
                      </span>
                      <span className="tutorial-card-status">
                        {tutorial.masteredUnitCount === tutorial.plan.unit_count
                          ? "Complete"
                          : "In progress"}
                      </span>
                    </div>
                    <h2>{tutorial.title}</h2>
                    <p className="tutorial-document-name">
                      {tutorial.documentName}
                    </p>
                    <dl className="tutorial-metrics">
                      <div>
                        <dt>Pages</dt>
                        <dd>{tutorial.map.page_count}</dd>
                      </div>
                      <div>
                        <dt>Concepts</dt>
                        <dd>{tutorial.map.concept_count}</dd>
                      </div>
                      <div>
                        <dt>Progress</dt>
                        <dd>
                          {tutorial.masteredUnitCount}/
                          {tutorial.plan.unit_count}
                        </dd>
                      </div>
                    </dl>
                    <div className="tutorial-progress">
                      <span
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    <div className="tutorial-card-footer">
                      <span>{formatUpdatedAt(tutorial.updatedAt)}</span>
                      <strong>
                        Continue
                        <ArrowRight size={15} aria-hidden="true" />
                      </strong>
                    </div>
                  </Link>
                  <button
                    className="tutorial-delete-button"
                    type="button"
                    onClick={() => setTutorialToDelete(tutorial)}
                    aria-label={`Delete ${tutorial.title}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

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
            <p className="modal-eyebrow">Tutorial management</p>
            <h2 id="delete-tutorial-title">Delete this tutorial?</h2>
            <p className="modal-copy">
              <strong>{tutorialToDelete.title}</strong> and its source PDF,
              teaching materials, and learning progress will be permanently
              deleted from this machine.
            </p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setTutorialToDelete(null)}
                disabled={deleting}
              >
                Keep Tutorial
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                onClick={deleteTutorial}
                disabled={deleting}
              >
                <Trash2 size={19} />
                {deleting ? "Deleting…" : "Delete Tutorial"}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className={`toast${toast ? " visible" : ""}`} aria-live="polite">
        {toast}
      </div>
    </main>
  );
}

function formatUpdatedAt(updatedAt: string) {
  return updatedAtFormatter.format(new Date(updatedAt));
}

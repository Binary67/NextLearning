"use client";

import { LoaderCircle, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type { TutorialResponse } from "@/lib/tutorial";

type AppSection = "library" | "dashboard";
const QUEUE_REFRESH_INTERVAL_MS = 3000;

export function AppHeader({
  activeSection,
  dashboardHref,
  settingsOpen,
  onOpenSettings,
  onShowMessage,
}: {
  activeSection: AppSection;
  dashboardHref: string | null;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onShowMessage: (message: string) => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    function closeProfileOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    }

    window.addEventListener("keydown", closeProfileOnEscape);
    return () => window.removeEventListener("keydown", closeProfileOnEscape);
  }, [profileOpen]);

  function openSettings() {
    setProfileOpen(false);
    onOpenSettings();
  }

  return (
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
        <Link
          className={`nav-link${activeSection === "library" ? " active" : ""}`}
          href="/library"
          aria-current={activeSection === "library" ? "page" : undefined}
        >
          Library
        </Link>
        {dashboardHref ? (
          <Link
            className={`nav-link${activeSection === "dashboard" ? " active" : ""}`}
            href={dashboardHref}
            aria-current={activeSection === "dashboard" ? "page" : undefined}
          >
            Dashboard
          </Link>
        ) : (
          <button
            className="nav-link"
            type="button"
            disabled
            title="Choose or add a document to open the reader"
          >
            Dashboard
          </button>
        )}
      </nav>

      <div className="header-actions">
        <TutorialQueueIndicator onShowMessage={onShowMessage} />
        <button
          className="icon-button"
          type="button"
          onClick={openSettings}
          aria-label="Open learning settings"
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
        >
          <Settings size={25} />
        </button>
        <div className="popover-anchor">
          <button
            className="avatar"
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
          >
            AM
          </button>
          {profileOpen && (
            <div className="popover profile-popover">
              <div className="profile-summary">
                <span className="avatar avatar-large">AM</span>
                <span>
                  <strong>Alex Morgan</strong>
                  <small>Quantum Physics 101</small>
                </span>
              </div>
              <button
                type="button"
                onClick={() => onShowMessage("Profile selected.")}
              >
                <User size={17} />
                View profile
              </button>
              <button
                type="button"
                onClick={() => onShowMessage("Sign out selected.")}
              >
                <LogOut size={17} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function TutorialQueueIndicator({
  onShowMessage,
}: {
  onShowMessage: (message: string) => void;
}) {
  const [queuedCount, setQueuedCount] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const previousStatusesRef = useRef<Map<
    string,
    TutorialResponse["status"]
  > | null>(null);
  const showMessage = useEffectEvent(onShowMessage);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimeout: number | undefined;

    async function loadQueueStatus() {
      try {
        const response = await fetch("/api/tutorials", {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          tutorials?: TutorialResponse[];
        };

        if (response.ok && data.tutorials) {
          showCompletedTutorialMessage(
            previousStatusesRef.current,
            data.tutorials,
            showMessage,
          );
          previousStatusesRef.current = new Map(
            data.tutorials.map((tutorial) => [
              tutorial.id,
              tutorial.status,
            ]),
          );
          const counts = countActiveTutorials(data.tutorials);
          setQueuedCount(counts.queued);
          setProcessingCount(counts.processing);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Document queue status could not be loaded:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          refreshTimeout = window.setTimeout(
            loadQueueStatus,
            QUEUE_REFRESH_INTERVAL_MS,
          );
        }
      }
    }

    loadQueueStatus();
    return () => {
      controller.abort();
      window.clearTimeout(refreshTimeout);
    };
  }, []);

  if (queuedCount === 0 && processingCount === 0) {
    return null;
  }

  const label = formatQueueStatus(queuedCount, processingCount);

  return (
    <span
      className="queue-indicator"
      aria-label={label}
      aria-live="polite"
    >
      <LoaderCircle size={15} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function countActiveTutorials(tutorials: TutorialResponse[]) {
  let queued = 0;
  let processing = 0;

  for (const tutorial of tutorials) {
    if (tutorial.status === "queued") {
      queued += 1;
    } else if (tutorial.status === "processing") {
      processing += 1;
    }
  }

  return { queued, processing };
}

function showCompletedTutorialMessage(
  previousStatuses: Map<string, TutorialResponse["status"]> | null,
  tutorials: TutorialResponse[],
  showMessage: (message: string) => void,
) {
  if (!previousStatuses) {
    return;
  }

  const completedTutorials = tutorials.filter((tutorial) => {
    const previousStatus = previousStatuses.get(tutorial.id);

    return (
      (previousStatus === "queued" || previousStatus === "processing") &&
      (tutorial.status === "ready" || tutorial.status === "failed")
    );
  });

  if (completedTutorials.length === 0) {
    return;
  }

  const failed = completedTutorials.some(
    (tutorial) => tutorial.status === "failed",
  );
  showMessage(
    failed
      ? "A document could not be prepared. Open the library to retry."
      : "Your document is ready to open.",
  );
}

function formatQueueStatus(queuedCount: number, processingCount: number) {
  const statuses: string[] = [];

  if (processingCount > 0) {
    statuses.push(`${processingCount} preparing`);
  }

  if (queuedCount > 0) {
    statuses.push(`${queuedCount} queued`);
  }

  return statuses.join(" · ");
}

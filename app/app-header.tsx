"use client";

import { LoaderCircle, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  countActiveTutorials,
  getTutorialTransitionMessage,
  type TutorialStatusItem,
} from "@/lib/tutorial-status";

type AppSection = "library" | "dashboard";
const QUEUE_REFRESH_INTERVAL_MS = 3000;

export function AppHeader({
  activeSection,
  dashboardHref,
  settingsOpen,
  onOpenSettings,
  onShowMessage,
  tutorialStatuses,
}: {
  activeSection: AppSection;
  dashboardHref: string | null;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onShowMessage: (message: string) => void;
  tutorialStatuses?: readonly TutorialStatusItem[];
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
        <TutorialQueueIndicator
          onShowMessage={onShowMessage}
          tutorialStatuses={tutorialStatuses}
        />
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
  tutorialStatuses,
}: {
  onShowMessage: (message: string) => void;
  tutorialStatuses?: readonly TutorialStatusItem[];
}) {
  const [fetchedStatuses, setFetchedStatuses] = useState<
    TutorialStatusItem[]
  >([]);
  const previousStatusesRef = useRef<Map<
    string,
    TutorialStatusItem["status"]
  > | null>(null);
  const statusesProvided = tutorialStatuses !== undefined;
  const statuses = tutorialStatuses ?? fetchedStatuses;
  const counts = countActiveTutorials(statuses);
  const updateNotificationHistory = useEffectEvent(
    (tutorials: readonly TutorialStatusItem[]) => {
      const message = getTutorialTransitionMessage(
        previousStatusesRef.current,
        tutorials,
      );
      previousStatusesRef.current = new Map(
        tutorials.map((tutorial) => [
          tutorial.id,
          tutorial.status,
        ]),
      );

      if (message) {
        onShowMessage(message);
      }
    },
  );

  useEffect(() => {
    updateNotificationHistory(statuses);
  }, [statuses]);

  useEffect(() => {
    if (statusesProvided) {
      return;
    }

    const controller = new AbortController();
    let refreshTimeout: number | undefined;

    async function loadQueueStatus() {
      try {
        const response = await fetch("/api/tutorials/status", {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          tutorials?: TutorialStatusItem[];
        };

        if (response.ok && data.tutorials) {
          setFetchedStatuses(data.tutorials);
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
  }, [statusesProvided]);

  if (counts.queued === 0 && counts.processing === 0) {
    return null;
  }

  const label = formatQueueStatus(counts.queued, counts.processing);

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

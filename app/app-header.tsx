"use client";

import { LoaderCircle, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  countActiveTutorials,
  type TutorialStatusItem,
} from "@/lib/tutorial-status";

type AppSection = "library" | "review" | "reader" | "progress";

export function AppHeader({
  activeSection,
  tutorialHref,
  settingsOpen,
  onOpenSettings,
  onShowMessage,
  tutorialStatuses,
}: {
  activeSection: AppSection;
  tutorialHref: string | null;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onShowMessage: (message: string) => void;
  tutorialStatuses: readonly TutorialStatusItem[];
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
        <Link
          className={`nav-link${activeSection === "review" ? " active" : ""}`}
          href="/review"
          aria-current={activeSection === "review" ? "page" : undefined}
        >
          Review
        </Link>
        {tutorialHref ? (
          <>
            <Link
              className={`nav-link${activeSection === "reader" ? " active" : ""}`}
              href={tutorialHref}
              aria-current={activeSection === "reader" ? "page" : undefined}
            >
              Reader
            </Link>
            <Link
              className={`nav-link${activeSection === "progress" ? " active" : ""}`}
              href={`${tutorialHref}/progress`}
              aria-current={activeSection === "progress" ? "page" : undefined}
            >
              Progress
            </Link>
          </>
        ) : (
          <>
            <button
              className="nav-link"
              type="button"
              disabled
              title="Choose or add a document to open the reader"
            >
              Reader
            </button>
            <button
              className="nav-link"
              type="button"
              disabled
              title="Choose or add a document to view progress"
            >
              Progress
            </button>
          </>
        )}
      </nav>

      <div className="header-actions">
        <TutorialQueueIndicator
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
  tutorialStatuses,
}: {
  tutorialStatuses: readonly TutorialStatusItem[];
}) {
  const counts = countActiveTutorials(tutorialStatuses);

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

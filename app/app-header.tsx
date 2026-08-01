"use client";

import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type AppSection = "library" | "dashboard";

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

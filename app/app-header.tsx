import Link from "next/link";
import type { ReactNode } from "react";

type AppSection = "library" | "dashboard";

export function AppHeader({
  activeSection,
  dashboardHref,
  onCoursesClick,
  children,
}: {
  activeSection: AppSection;
  dashboardHref: string | null;
  onCoursesClick: () => void;
  children: ReactNode;
}) {
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
            title="Choose or create a tutorial to open the dashboard"
          >
            Dashboard
          </button>
        )}
        <button
          className="nav-link"
          type="button"
          onClick={onCoursesClick}
        >
          Courses
        </button>
      </nav>

      <div className="header-actions">{children}</div>
    </header>
  );
}

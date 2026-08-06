"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppHeader } from "@/app/app-header";
import { LearningSettingsDialog } from "@/app/learning-settings";
import type { TutorialResponse } from "@/lib/tutorial";
import {
  getTutorialTransitionMessage,
  hasActiveTutorials,
} from "@/lib/tutorial-status";

const TUTORIAL_REFRESH_INTERVAL_MS = 3000;

type SettingsRegistration = {
  isOpen: boolean;
  open: () => void;
};

type ApplicationShellContextValue = {
  tutorials: TutorialResponse[];
  tutorialRevision: number;
  addTutorial: (tutorial: TutorialResponse) => void;
  updateTutorial: (tutorial: TutorialResponse) => void;
  removeTutorial: (tutorialId: string) => void;
  registerSettings: (
    registration: SettingsRegistration | null,
  ) => void;
  showToast: (message: string) => void;
};

const ApplicationShellContext =
  createContext<ApplicationShellContextValue | null>(null);

export function ApplicationShell({
  initialTutorials,
  children,
}: {
  initialTutorials: TutorialResponse[];
  children: React.ReactNode;
}) {
  const [tutorials, setTutorials] = useState(initialTutorials);
  const [tutorialRevision, setTutorialRevision] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsRegistration, setSettingsRegistration] =
    useState<SettingsRegistration | null>(null);
  const [toast, setToast] = useState("");
  const refreshControllerRef = useRef<AbortController | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const previousStatusesRef = useRef(
    new Map(
      initialTutorials.map((tutorial) => [
        tutorial.id,
        tutorial.status,
      ]),
    ),
  );
  const toastTimeoutRef = useRef<number | undefined>(undefined);
  const shouldPoll = hasActiveTutorials(tutorials);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = window.setTimeout(
      () => setToast(""),
      2600,
    );
  }, []);

  const replaceTutorials = useCallback(
    (nextTutorials: TutorialResponse[]) => {
      const message = getTutorialTransitionMessage(
        previousStatusesRef.current,
        nextTutorials,
      );
      previousStatusesRef.current = new Map(
        nextTutorials.map((tutorial) => [
          tutorial.id,
          tutorial.status,
        ]),
      );
      setTutorials(nextTutorials);
      setTutorialRevision((revision) => revision + 1);

      if (message) {
        showToast(message);
      }
    },
    [showToast],
  );

  const refreshTutorials = useCallback(() => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const controller = new AbortController();
    refreshControllerRef.current = controller;

    async function refresh() {
      try {
        const response = await fetch("/api/tutorials", {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          tutorials?: TutorialResponse[];
        };

        if (response.ok && data.tutorials) {
          replaceTutorials(data.tutorials);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Document status could not be refreshed:", error);
        }
      } finally {
        if (refreshControllerRef.current === controller) {
          refreshControllerRef.current = null;
          refreshInFlightRef.current = null;
        }
      }
    }

    const refreshPromise = refresh();
    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [replaceTutorials]);

  useEffect(() => {
    function refreshOnFocus() {
      void refreshTutorials();
    }

    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      refreshControllerRef.current?.abort();
      window.clearTimeout(toastTimeoutRef.current);
    };
  }, [refreshTutorials]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    let cancelled = false;
    let refreshTimeout = window.setTimeout(
      pollTutorials,
      TUTORIAL_REFRESH_INTERVAL_MS,
    );

    function pollTutorials() {
      void refreshTutorials().finally(() => {
        if (!cancelled) {
          refreshTimeout = window.setTimeout(
            pollTutorials,
            TUTORIAL_REFRESH_INTERVAL_MS,
          );
        }
      });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimeout);
    };
  }, [refreshTutorials, shouldPoll]);

  const addTutorial = useCallback((tutorial: TutorialResponse) => {
    previousStatusesRef.current.set(tutorial.id, tutorial.status);
    setTutorials((currentTutorials) => [
      tutorial,
      ...currentTutorials.filter(
        (currentTutorial) => currentTutorial.id !== tutorial.id,
      ),
    ]);
    setTutorialRevision((revision) => revision + 1);
  }, []);

  const updateTutorial = useCallback((tutorial: TutorialResponse) => {
    previousStatusesRef.current.set(tutorial.id, tutorial.status);
    setTutorials((currentTutorials) =>
      currentTutorials.map((currentTutorial) =>
        currentTutorial.id === tutorial.id
          ? tutorial
          : currentTutorial,
      ),
    );
    setTutorialRevision((revision) => revision + 1);
  }, []);

  const removeTutorial = useCallback((tutorialId: string) => {
    previousStatusesRef.current.delete(tutorialId);
    setTutorials((currentTutorials) =>
      currentTutorials.filter(
        (tutorial) => tutorial.id !== tutorialId,
      ),
    );
    setTutorialRevision((revision) => revision + 1);
  }, []);

  const registerSettings = useCallback(
    (registration: SettingsRegistration | null) => {
      if (registration) {
        setSettingsOpen(false);
      }

      setSettingsRegistration(registration);
    },
    [],
  );
  const contextValue = useMemo(
    () => ({
      tutorials,
      tutorialRevision,
      addTutorial,
      updateTutorial,
      removeTutorial,
      registerSettings,
      showToast,
    }),
    [
      addTutorial,
      registerSettings,
      removeTutorial,
      showToast,
      tutorialRevision,
      tutorials,
      updateTutorial,
    ],
  );

  return (
    <ApplicationShellContext.Provider value={contextValue}>
      <div className="app-shell">
        <Suspense
          fallback={
            <AppHeader
              activeSection="library"
              dashboardHref={getLatestDashboardHref(tutorials)}
              settingsOpen={settingsOpen}
              onOpenSettings={() => setSettingsOpen(true)}
              onShowMessage={showToast}
              tutorialStatuses={tutorials}
            />
          }
        >
          <ApplicationHeader
            tutorials={tutorials}
            settingsOpen={
              settingsRegistration?.isOpen ?? settingsOpen
            }
            onOpenSettings={
              settingsRegistration?.open ??
              (() => setSettingsOpen(true))
            }
            onShowMessage={showToast}
          />
        </Suspense>
        {children}
      </div>

      {settingsOpen && !settingsRegistration && (
        <LearningSettingsDialog
          onClose={() => setSettingsOpen(false)}
          onShowMessage={showToast}
        />
      )}

      <div className={`toast${toast ? " visible" : ""}`} aria-live="polite">
        {toast}
      </div>
    </ApplicationShellContext.Provider>
  );
}

export function useApplicationShell() {
  const value = useContext(ApplicationShellContext);

  if (!value) {
    throw new Error(
      "useApplicationShell must be used inside ApplicationShell.",
    );
  }

  return value;
}

function ApplicationHeader({
  tutorials,
  settingsOpen,
  onOpenSettings,
  onShowMessage,
}: {
  tutorials: TutorialResponse[];
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onShowMessage: (message: string) => void;
}) {
  const pathname = usePathname();
  const tutorialMatch = pathname.match(
    /^\/tutorials\/([^/]+)(?:\/progress)?$/,
  );
  const currentTutorialHref = tutorialMatch
    ? `/tutorials/${tutorialMatch[1]}`
    : null;
  const activeSection = pathname.startsWith("/review")
    ? "review"
    : currentTutorialHref
      ? "dashboard"
      : "library";

  return (
    <AppHeader
      activeSection={activeSection}
      dashboardHref={
        currentTutorialHref ?? getLatestDashboardHref(tutorials)
      }
      settingsOpen={settingsOpen}
      onOpenSettings={onOpenSettings}
      onShowMessage={onShowMessage}
      tutorialStatuses={tutorials}
    />
  );
}

function getLatestDashboardHref(tutorials: TutorialResponse[]) {
  const latestReadyTutorial = tutorials.find(
    (tutorial) => tutorial.status === "ready",
  );

  return latestReadyTutorial
    ? `/tutorials/${latestReadyTutorial.id}`
    : null;
}

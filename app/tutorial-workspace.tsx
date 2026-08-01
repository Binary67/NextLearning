"use client";

import {
  ArrowDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Hand,
  Keyboard,
  LogOut,
  MessageSquareText,
  PanelRight,
  Pause,
  Play,
  Route,
  RotateCcw,
  ScanText,
  Settings,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { AppHeader } from "@/app/app-header";
import { NewTutorialButton } from "@/app/new-tutorial-button";
import { PdfDocumentViewer } from "@/app/pdf-document-viewer";
import {
  buildPageLearningContext,
  type DocumentModel,
} from "@/lib/document-model";
import {
  findActiveTeachingUnit,
  type LearningProgress,
} from "@/lib/learning-progress";
import type {
  TeachingPlan,
  TeachingUnit,
} from "@/lib/teaching-plan";
import type { TutorialResponse } from "@/lib/tutorial";
import { useRealtimeTutor } from "@/lib/use-realtime-tutor";

type Modal =
  | "analysis"
  | "transcript"
  | "shortcuts"
  | "settings"
  | "end-session"
  | "reset-progress"
  | "delete-tutorial"
  | null;
type Popover = "profile" | null;

const DEFAULT_RAISE_HAND_SHORTCUT = " ";
const RAISE_HAND_SHORTCUT_STORAGE_KEY =
  "nextlearning.raise-hand-shortcut";
const AUDIO_INPUT_STORAGE_KEY = "nextlearning.audio-input-device";
const AUDIO_OUTPUT_STORAGE_KEY = "nextlearning.audio-output-device";
const LOCAL_SETTINGS_EVENT = "nextlearning-settings-change";
const RESERVED_SHORTCUT_KEYS = new Set(["a", "e", "t"]);

export function TutorialWorkspace({
  tutorialId,
}: {
  tutorialId: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [popover, setPopover] = useState<Popover>(null);
  const [timerRunning, setTimerRunning] = useState(true);
  const [insightsVisible, setInsightsVisible] = useState(true);
  const [documentPreparationExpanded, setDocumentPreparationExpanded] =
    useState(true);
  const [pageContextExpanded, setPageContextExpanded] = useState(true);
  const [learningPathExpanded, setLearningPathExpanded] = useState(false);
  const [tutorTranscriptExpanded, setTutorTranscriptExpanded] =
    useState(false);
  const [toast, setToast] = useState("");
  const [activeTutorial, setActiveTutorial] =
    useState<TutorialResponse | null>(null);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState("");
  const [deletingTutorial, setDeletingTutorial] = useState(false);
  const [resettingProgress, setResettingProgress] = useState(false);
  const raiseHandShortcut = useLocalSetting(
    RAISE_HAND_SHORTCUT_STORAGE_KEY,
    DEFAULT_RAISE_HAND_SHORTCUT,
  );
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const audioInputDeviceId = useLocalSetting(AUDIO_INPUT_STORAGE_KEY, "");
  const audioOutputDeviceId = useLocalSetting(
    AUDIO_OUTPUT_STORAGE_KEY,
    "",
  );
  const [audioInputDevices, setAudioInputDevices] = useState<
    MediaDeviceInfo[]
  >([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<
    MediaDeviceInfo[]
  >([]);
  const [audioDevicesLoading, setAudioDevicesLoading] = useState(false);
  const [changingAudioDevice, setChangingAudioDevice] = useState<
    "input" | "output" | null
  >(null);
  const [settingsError, setSettingsError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [teachingPlan, setTeachingPlan] =
    useState<TeachingPlan | null>(null);
  const [documentModel, setDocumentModel] =
    useState<DocumentModel | null>(null);
  const [learningProgress, setLearningProgress] =
    useState<LearningProgress | null>(null);
  const activeUnit =
    teachingPlan && learningProgress
      ? findActiveTeachingUnit(teachingPlan, learningProgress)
      : null;
  const pageContext = useMemo(
    () =>
      documentModel
        ? buildPageLearningContext(documentModel, currentPage)
        : null,
    [currentPage, documentModel],
  );
  const pageContextLoading = activeTutorial !== null && documentLoading;
  const pageContextError = documentModel ? "" : documentError;
  const realtimeTutor = useRealtimeTutor({
    documentId: activeTutorial?.id ?? null,
    documentUrl: activeTutorial?.url ?? null,
    documentModel,
    teachingPlan,
    activeUnit,
    audioInputDeviceId,
    audioOutputDeviceId,
    onPageChange: setCurrentPage,
    onProgressChange: setLearningProgress,
  });
  const sessionEnded = realtimeTutor.status === "ended";
  const tutorSessionActive =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.status === "connected";
  const isTutorTranscriptExpanded =
    tutorSessionActive && tutorTranscriptExpanded;
  const modalBusy =
    (modal === "reset-progress" && resettingProgress) ||
    (modal === "delete-tutorial" && deletingTutorial);
  const isUserTurn = realtimeTutor.isUserTurn;
  const isQuestionTurn =
    realtimeTutor.learnerTurnPurpose === "interruption" ||
    realtimeTutor.learnerTurnPurpose === "follow-up";
  const raiseHandShortcutLabel = formatShortcut(raiseHandShortcut);
  const audioSettingsDisabled =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.isUserTurn ||
    realtimeTutor.isSubmittingUserTurn;
  let userTurnActionLabel = realtimeTutor.isAwaitingLearnerAnswer
    ? "Answer tutor question"
    : "Raise hand to ask a question";

  if (realtimeTutor.isSubmittingUserTurn) {
    userTurnActionLabel = isQuestionTurn
      ? "Sending question"
      : "Sending answer";
  } else if (isUserTurn) {
    userTurnActionLabel = isQuestionTurn
      ? "Done asking"
      : "Done answering";
  }

  const completedLessonStepIds = new Set(
    realtimeTutor.completedLessonStepIds,
  );
  const currentLessonStep =
    activeUnit?.lesson_steps.find(
      (step) => !completedLessonStepIds.has(step.id),
    ) ?? null;
  const currentLessonStepReady =
    currentLessonStep?.id === realtimeTutor.readyLessonStepId;
  const isLastLessonStep =
    currentLessonStep !== null &&
    activeUnit?.lesson_steps.at(-1)?.id === currentLessonStep.id;
  const tutorQuestion =
    realtimeTutor.status === "connected" &&
    realtimeTutor.isAwaitingLearnerAnswer &&
    !realtimeTutor.isSubmittingUserTurn &&
    !realtimeTutor.isTutorResponding &&
    !realtimeTutor.isTutorSpeaking
      ? getLatestTutorQuestion(realtimeTutor.tutorTranscripts.at(-1) ?? "")
      : "";
  const masteredUnitCount = learningProgress
    ? Object.keys(learningProgress.unit_progress).length
    : 0;
  const tutorialComplete =
    teachingPlan !== null &&
    learningProgress !== null &&
    activeUnit === null;

  useEffect(() => {
    const controller = new AbortController();

    async function loadTutorialData() {
      setDocumentLoading(true);
      setDocumentError("");
      setActiveTutorial(null);
      setTeachingPlan(null);
      setDocumentModel(null);
      setLearningProgress(null);

      try {
        const response = await fetch(`/api/tutorials/${tutorialId}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          tutorial?: TutorialResponse;
          plan?: TeachingPlan;
          model?: DocumentModel;
          progress?: LearningProgress;
          message?: string;
        };

        if (
          !response.ok ||
          !data.tutorial ||
          !data.plan ||
          !data.model ||
          !data.progress
        ) {
          throw new Error(
            data.message ?? "The tutorial could not be loaded.",
          );
        }

        setActiveTutorial(data.tutorial);
        setDocumentPreparationExpanded(false);
        setTeachingPlan(data.plan);
        setDocumentModel(data.model);
        setLearningProgress(data.progress);
        const initialUnit = findActiveTeachingUnit(
          data.plan,
          data.progress,
        );

        if (initialUnit) {
          setCurrentPage(getInitialUnitPageIndex(initialUnit));
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setDocumentError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setDocumentLoading(false);
        }
      }
    }

    loadTutorialData();
    return () => controller.abort();
  }, [tutorialId]);

  const refreshAudioDevices = useCallback(
    async (requestMicrophonePermission: boolean) => {
      setAudioDevicesLoading(true);
      setSettingsError("");

      try {
        if (requestMicrophonePermission) {
          const permissionStream =
            await navigator.mediaDevices.getUserMedia({ audio: true });

          for (const track of permissionStream.getTracks()) {
            track.stop();
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();

        setAudioInputDevices(
          devices.filter((device) => device.kind === "audioinput"),
        );
        setAudioOutputDevices(
          devices.filter((device) => device.kind === "audiooutput"),
        );
      } catch (reason) {
        setSettingsError(
          reason instanceof Error
            ? reason.message
            : "Audio devices could not be loaded.",
        );
      } finally {
        setAudioDevicesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    function handleDeviceChange() {
      void refreshAudioDevices(false);
    }

    navigator.mediaDevices.addEventListener(
      "devicechange",
      handleDeviceChange,
    );
    return () =>
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
  }, [refreshAudioDevices]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  function toggleTimer() {
    setTimerRunning((running) => !running);
    showToast(timerRunning ? "Focus timer paused." : "Focus timer resumed.");
  }

  function toggleProfilePopover() {
    setPopover((currentPopover) =>
      currentPopover === "profile" ? null : "profile",
    );
  }

  function openSettings() {
    setPopover(null);
    setModal("settings");
    setRecordingShortcut(false);
    void refreshAudioDevices(realtimeTutor.status !== "connected");
  }

  function recordRaiseHandShortcut(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setRecordingShortcut(false);
      setSettingsError("");
      return;
    }

    const shortcut = normalizeShortcut(event);

    if (!shortcut || RESERVED_SHORTCUT_KEYS.has(shortcut)) {
      setSettingsError(
        "Choose Space, a letter, or a number that is not A, T, or E.",
      );
      return;
    }

    setRecordingShortcut(false);
    setSettingsError("");
    saveLocalSetting(
      RAISE_HAND_SHORTCUT_STORAGE_KEY,
      shortcut,
    );
  }

  async function changeAudioInputDevice(deviceId: string) {
    setChangingAudioDevice("input");
    setSettingsError("");

    const changed = await realtimeTutor.selectAudioInputDevice(deviceId);

    if (changed) {
      saveLocalSetting(AUDIO_INPUT_STORAGE_KEY, deviceId);
      showToast("Microphone updated.");
    } else {
      setSettingsError("The selected microphone could not be activated.");
    }

    setChangingAudioDevice(null);
  }

  async function changeAudioOutputDevice(deviceId: string) {
    setChangingAudioDevice("output");
    setSettingsError("");

    const changed = await realtimeTutor.selectAudioOutputDevice(deviceId);

    if (changed) {
      saveLocalSetting(AUDIO_OUTPUT_STORAGE_KEY, deviceId);
      showToast("Speaker updated.");
    } else {
      setSettingsError("The selected speaker could not be activated.");
    }

    setChangingAudioDevice(null);
  }

  const toggleUserTurn = useCallback(async () => {
    const actionSucceeded = await realtimeTutor.toggleUserTurn();

    if (!actionSucceeded) {
      return;
    }

    let toastMessage = `Listening. Press ${raiseHandShortcutLabel} or tap the check when you finish.`;

    if (isUserTurn) {
      toastMessage = isQuestionTurn
        ? "Question sent. Waiting for the tutor."
        : "Answer sent. Waiting for the tutor.";
    }

    showToast(toastMessage);
  }, [
    isQuestionTurn,
    isUserTurn,
    raiseHandShortcutLabel,
    realtimeTutor,
    showToast,
  ]);

  const advanceLessonStep = useCallback(async () => {
    const advanced = await realtimeTutor.advanceLessonStep();

    if (advanced) {
      showToast(
        isLastLessonStep
          ? "Finishing this learning unit."
          : "Moving to the next step.",
      );
    }
  }, [isLastLessonStep, realtimeTutor, showToast]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isInteractiveTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(
            target.tagName,
          ));

      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isInteractiveTarget
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (modalBusy) {
        return;
      }

      if (key === "escape") {
        setModal(null);
        setPopover(null);
      } else if (key === "a") {
        setModal("analysis");
      } else if (
        key === "t" &&
        realtimeTutor.tutorTranscripts.length > 0
      ) {
        setModal("transcript");
      } else if (key === "e" && !sessionEnded) {
        setModal("end-session");
      } else if (
        key === raiseHandShortcut &&
        realtimeTutor.status === "connected" &&
        modal === null
      ) {
        event.preventDefault();
        void toggleUserTurn();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    modal,
    modalBusy,
    raiseHandShortcut,
    realtimeTutor.status,
    realtimeTutor.tutorTranscripts.length,
    sessionEnded,
    toggleUserTurn,
  ]);

  function downloadDocument() {
    if (!activeTutorial) {
      return;
    }

    const link = document.createElement("a");
    link.href = `${activeTutorial.url}?download=1`;
    link.click();
    showToast("Document download started.");
  }

  function closeModal() {
    if (modalBusy) {
      return;
    }

    setModal(null);
  }

  async function resetProgress() {
    setResettingProgress(true);

    try {
      const response = await fetch(
        `/api/tutorials/${tutorialId}/progress`,
        {
          method: "PUT",
        },
      );
      const data = (await response.json()) as {
        progress?: LearningProgress;
        message?: string;
      };

      if (!response.ok || !data.progress) {
        throw new Error(
          data.message ?? "Learning progress could not be reset.",
        );
      }

      realtimeTutor.reset();
      setLearningProgress(data.progress);

      const firstUnit = teachingPlan
        ? findActiveTeachingUnit(teachingPlan, data.progress)
        : null;

      if (firstUnit) {
        setCurrentPage(getInitialUnitPageIndex(firstUnit));
      }

      setModal(null);
      showToast("Learning progress reset.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Learning progress could not be reset.",
      );
    } finally {
      setResettingProgress(false);
    }
  }

  async function deleteTutorial() {
    setDeletingTutorial(true);

    try {
      const response = await fetch(`/api/tutorials/${tutorialId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("The tutorial could not be deleted.");
      }

      realtimeTutor.reset();
      router.replace("/library");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "The tutorial could not be deleted.",
      );
    } finally {
      setDeletingTutorial(false);
    }
  }

  function confirmEndSession() {
    realtimeTutor.end();
    setTimerRunning(false);
    setModal(null);
    showToast("Session ended.");
  }

  function startTutor() {
    setTimerRunning(true);
    setTutorTranscriptExpanded(true);
    void realtimeTutor.start();
  }

  function renderTutorStatus() {
    if (sessionEnded) {
      return <span>Session complete</span>;
    }

    if (realtimeTutor.status === "connecting") {
      return <strong>Connecting…</strong>;
    }

    if (realtimeTutor.status === "connected") {
      if (realtimeTutor.error) {
        return (
          <span className="turn-state-copy error">
            <small>Tutor issue</small>
            <strong>{realtimeTutor.error}</strong>
          </span>
        );
      }

      if (isUserTurn) {
        const listeningPrompt = isQuestionTurn
          ? "Ask your question, then tap the check"
          : "Speak your answer, then tap the check";

        return (
          <span className="turn-state-copy">
            <small className="listening-label">
              <span className="listening-dot" aria-hidden="true" />
              Listening
            </small>
            <strong>{listeningPrompt}</strong>
          </span>
        );
      }

      if (realtimeTutor.isSubmittingUserTurn) {
        const submissionLabel = isQuestionTurn
          ? "Sending your question…"
          : "Sending your answer…";

        return (
          <span className="turn-state-copy">
            <small>Your turn</small>
            <strong>{submissionLabel}</strong>
          </span>
        );
      }

      if (
        realtimeTutor.isTutorResponding ||
        realtimeTutor.isTutorSpeaking
      ) {
        const tutorTurnLabel = realtimeTutor.isTutorSpeaking
          ? "Tutor speaking"
          : "Tutor thinking";

        return (
          <span className="turn-state-copy">
            <small>{tutorTurnLabel}</small>
            <strong>{tutorTurnLabel}…</strong>
          </span>
        );
      }

      if (currentLessonStepReady) {
        return (
          <span className="turn-state-copy">
            <small>Step ready</small>
            <strong>Ask a question or continue when ready</strong>
          </span>
        );
      }

      return (
        <span className="turn-state-copy">
          <small>Your turn</small>
          <strong>
            {realtimeTutor.isAwaitingLearnerAnswer
              ? "Answer when you’re ready"
              : "Raise your hand to ask a question"}
          </strong>
        </span>
      );
    }

    if (tutorialComplete) {
      return <strong>Blueprint mastered</strong>;
    }

    if (realtimeTutor.status === "error") {
      return (
        <span className="turn-state-copy error">
          <small>Tutor unavailable</small>
          <strong>
            {realtimeTutor.error || "The tutor connection failed."}
          </strong>
        </span>
      );
    }

    return <strong>Ready to start</strong>;
  }

  function renderSessionAction() {
    if (sessionEnded) {
      return (
        <button
          className="primary-button end-button"
          type="button"
          onClick={startTutor}
          disabled={!activeUnit}
        >
          <Play size={20} />
          New Session
        </button>
      );
    }

    if (
      realtimeTutor.status === "connected" ||
      realtimeTutor.status === "connecting"
    ) {
      return (
        <button
          className="primary-button end-button"
          type="button"
          onClick={() => setModal("end-session")}
        >
          <LogOut size={21} />
          End Session
        </button>
      );
    }

    return (
      <button
        className="primary-button end-button"
        type="button"
        onClick={startTutor}
        disabled={!activeUnit}
      >
        <Play size={20} />
        {tutorialComplete ? "Complete" : "Start Tutor"}
      </button>
    );
  }

  const insightsToggleLabel = insightsVisible
    ? "Hide insights"
    : "Show insights";
  const documentPreparationSummary = activeTutorial
    ? `Ready · ${activeTutorial.map.concept_count} concepts · ${activeTutorial.plan.unit_count} units`
    : "Waiting for a document";
  let pageContextSummary = "Waiting for a document";

  if (activeTutorial) {
    pageContextSummary = `Page ${currentPage}`;

    if (pageContextLoading) {
      pageContextSummary += " · Loading context";
    } else if (pageContextError) {
      pageContextSummary += " · Context unavailable";
    } else if (pageContext) {
      const conceptCount = pageContext.current_concepts.length;
      const conceptLabel = conceptCount === 1 ? "concept" : "concepts";
      const futureConnectionCount =
        pageContext.future_connections.length;
      pageContextSummary +=
        ` · ${conceptCount} ${conceptLabel} · ${futureConnectionCount} later`;
    }
  }

  let learningPathSummary = "Waiting for a document";

  if (activeTutorial) {
    learningPathSummary =
      teachingPlan && learningProgress
        ? `${masteredUnitCount} of ${teachingPlan.units.length} units mastered`
        : "Learning progress is loading";
  }

  function renderCurrentConcepts() {
    if (pageContextLoading) {
      return <li className="waiting">Loading mapped concepts…</li>;
    }

    if (pageContextError) {
      return <li className="context-error">{pageContextError}</li>;
    }

    if (!pageContext?.current_concepts.length) {
      return (
        <li className="waiting">No mapped concept on this page.</li>
      );
    }

    return pageContext.current_concepts.map((concept) => (
      <li key={`${concept.concept_id}:${concept.role}`}>
        <strong>{concept.name}</strong>
        <span>
          {concept.role.replaceAll("_", " ")}
          {concept.explicitness === "implicit" ? " · implicit" : ""}
        </span>
      </li>
    ));
  }

  function renderFutureConnections() {
    if (pageContextLoading) {
      return <li className="waiting">Loading future connections…</li>;
    }

    if (pageContextError) {
      return (
        <li className="waiting">Future connections are unavailable.</li>
      );
    }

    if (!pageContext?.future_connections.length) {
      return (
        <li className="waiting">No future connection needed here.</li>
      );
    }

    return pageContext.future_connections.map((connection) => (
      <li
        key={`${connection.to_concept_id}:${connection.page_index}`}
      >
        <strong>{connection.name}</strong>
        <span>
          Page {connection.page_label} · {connection.reason}
        </span>
      </li>
    ));
  }

  return (
    <main className="app-shell">
      <AppHeader
        activeSection="dashboard"
        dashboardHref={`/tutorials/${tutorialId}`}
        onCoursesClick={() =>
          showToast("Courses are ready for future learning paths.")
        }
      >
        <button
          className="icon-button"
          type="button"
          onClick={toggleTimer}
          aria-label={timerRunning ? "Pause focus timer" : "Resume focus timer"}
        >
          {timerRunning ? <Clock3 size={24} /> : <Play size={23} />}
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={openSettings}
          aria-label="Open learning settings"
          aria-expanded={modal === "settings"}
          aria-haspopup="dialog"
        >
          <Settings size={25} />
        </button>
        <div className="popover-anchor">
          <button
            className="avatar"
            type="button"
            onClick={toggleProfilePopover}
            aria-label="Open profile menu"
            aria-expanded={popover === "profile"}
          >
            AM
          </button>
          {popover === "profile" && (
            <div className="popover profile-popover">
              <div className="profile-summary">
                <span className="avatar avatar-large">AM</span>
                <span>
                  <strong>Alex Morgan</strong>
                  <small>Quantum Physics 101</small>
                </span>
              </div>
              <button type="button" onClick={() => showToast("Profile selected.")}>
                <User size={17} />
                View profile
              </button>
              <button type="button" onClick={() => showToast("Sign out selected.")}>
                <LogOut size={17} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </AppHeader>

      <div
        className={`dashboard-layout${insightsVisible ? "" : " insights-hidden"}`}
      >
        <section className="lesson-card" id="lesson" aria-labelledby="lesson-title">
          <div className="lesson-toolbar">
            <div>
              <FileText size={25} aria-hidden="true" />
              <h2 id="lesson-title">
                {activeTutorial?.title ?? "Your tutorial"}
              </h2>
            </div>
            <div className="lesson-toolbar-controls">
              {activeTutorial && (
                <div className="lesson-actions">
                  <button
                    className="icon-button small"
                    type="button"
                    onClick={downloadDocument}
                    aria-label="Download document"
                  >
                    <Download size={21} />
                  </button>
                  <NewTutorialButton variant="icon" />
                  <button
                    className="icon-button small danger-icon-button"
                    type="button"
                    onClick={() => setModal("delete-tutorial")}
                    aria-label="Delete tutorial"
                    disabled={deletingTutorial}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              )}
              <button
                className="icon-button small insights-toolbar-toggle"
                type="button"
                onClick={() => setInsightsVisible((visible) => !visible)}
                aria-label={insightsToggleLabel}
                aria-controls="learning-insights"
                aria-expanded={insightsVisible}
                title={insightsToggleLabel}
              >
                <PanelRight size={19} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="document-viewport">
            {documentLoading ? (
              <div className="document-state" aria-live="polite">
                <FileText size={38} aria-hidden="true" />
                <h1>Loading your document…</h1>
              </div>
            ) : activeTutorial ? (
              <div className="pdf-content">
                <div className="pdf-page-bar">
                  <div className="pdf-page-controls">
                    <button
                      className="icon-button small"
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                      disabled={currentPage === 1}
                      aria-label="Previous PDF page"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span>
                      <strong>{currentPage}</strong>
                      <i aria-hidden="true">/</i>
                      {activeTutorial.map.page_count}
                    </span>
                    <button
                      className="icon-button small"
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(
                            activeTutorial.map.page_count,
                            page + 1,
                          ),
                        )
                      }
                      disabled={
                        currentPage === activeTutorial.map.page_count
                      }
                      aria-label="Next PDF page"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  {realtimeTutor.activeVisualGuide?.page_index ===
                    currentPage && (
                    <div
                      className="pdf-visual-guide-context"
                      aria-live="polite"
                    >
                      <small>Now looking at</small>
                      <strong>
                        {realtimeTutor.activeVisualGuide.label}
                      </strong>
                    </div>
                  )}
                </div>
                <div className="pdf-stage">
                  <PdfDocumentViewer
                    documentId={activeTutorial.id}
                    documentUrl={activeTutorial.url}
                    documentName={activeTutorial.documentName}
                    pageIndex={currentPage}
                    visualGuide={
                      realtimeTutor.activeVisualGuide?.page_index ===
                      currentPage
                        ? realtimeTutor.activeVisualGuide
                        : null
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="document-state">
                <FileText size={38} aria-hidden="true" />
                <h1>Tutorial unavailable</h1>
                <p>
                  {documentError ||
                    "This tutorial could not be found or is not fully prepared."}
                </p>
                <Link
                  className="primary-button upload-button"
                  href="/library"
                >
                  Back to Library
                </Link>
              </div>
            )}
          </div>

          <div className="session-controls">
            {currentLessonStepReady && currentLessonStep && (
              <div className="lesson-step-ready" aria-live="polite">
                <div>
                  <small>Ready when you are</small>
                  <p>
                    Stay here for questions, or continue to{" "}
                    {isLastLessonStep
                      ? "finish this learning unit"
                      : "the next step"}.
                  </p>
                </div>
                <button
                  className="primary-button lesson-step-next-button"
                  type="button"
                  onClick={() => void advanceLessonStep()}
                  disabled={
                    isUserTurn ||
                    realtimeTutor.isSubmittingUserTurn ||
                    realtimeTutor.isTutorResponding ||
                    realtimeTutor.isTutorSpeaking
                  }
                >
                  {isLastLessonStep ? "Finish unit" : "Next step"}
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            {tutorQuestion && (
              <div
                className="tutor-question"
                aria-label="Tutor question"
                aria-live="polite"
              >
                <small>Quick check</small>
                <p>{tutorQuestion}</p>
              </div>
            )}
            <div className={`session-dock${sessionEnded ? " ended" : ""}`}>
              <button
                className={`dock-icon${isUserTurn ? " user-turn" : ""}`}
                type="button"
                onClick={() => void toggleUserTurn()}
                aria-label={userTurnActionLabel}
                aria-pressed={isUserTurn}
                title={`${userTurnActionLabel} (${raiseHandShortcutLabel})`}
                disabled={
                  realtimeTutor.status !== "connected" ||
                  realtimeTutor.isSubmittingUserTurn
                }
              >
                {isUserTurn ? <Check size={23} /> : <Hand size={23} />}
              </button>
              <div className="listening-status" aria-live="polite">
                {renderTutorStatus()}
              </div>
              <button
                className="dock-icon"
                type="button"
                onClick={() => setModal("transcript")}
                aria-label="View tutor transcript"
                title="View tutor transcript"
                disabled={realtimeTutor.tutorTranscripts.length === 0}
              >
                <MessageSquareText size={23} />
              </button>
              <button
                className="dock-icon"
                type="button"
                onClick={() => setModal("shortcuts")}
                aria-label="View keyboard shortcuts"
              >
                <Keyboard size={24} />
              </button>
              {renderSessionAction()}
            </div>
          </div>
        </section>

        <div className="insights-panel">
          <aside
            className="insights-column"
            id="learning-insights"
            aria-label="Learning insights"
          >
            <TutorTranscriptCard
              transcript={realtimeTutor.currentTutorTranscript}
              isActive={tutorSessionActive}
              isStreaming={
                realtimeTutor.isTutorResponding ||
                realtimeTutor.isTutorSpeaking
              }
              expanded={isTutorTranscriptExpanded}
              onToggle={() =>
                setTutorTranscriptExpanded((expanded) => !expanded)
              }
            />
            <section
              className={`insight-card understanding-card${
                documentPreparationExpanded ? "" : " collapsed"
              }`}
            >
              <InsightCardHeader
                title="Document preparation"
                icon={
                  <FileText
                    size={19}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                }
                expanded={documentPreparationExpanded}
                contentId="document-preparation-content"
                onToggle={() =>
                  setDocumentPreparationExpanded((expanded) => !expanded)
                }
                status={
                  activeTutorial ? (
                    <span
                      className="preparation-indicator"
                      aria-hidden="true"
                    >
                      <Check size={15} strokeWidth={2.5} />
                    </span>
                  ) : undefined
                }
              />
              <div
                className="insight-card-content"
                id="document-preparation-content"
                hidden={!documentPreparationExpanded}
              >
                {activeTutorial ? (
                  <>
                    <div className="preparation-status" role="status">
                      <h3>Ready to learn</h3>
                      <p>
                        The teaching plan and visual guidance are prepared.
                      </p>
                    </div>
                    <dl className="preparation-metrics">
                      <div>
                        <dt>Concepts</dt>
                        <dd>{activeTutorial.map.concept_count}</dd>
                      </div>
                      <div>
                        <dt>Connections</dt>
                        <dd>{activeTutorial.map.connection_count}</dd>
                      </div>
                      <div>
                        <dt>Teaching units</dt>
                        <dd>{activeTutorial.plan.unit_count}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <div className="preparation-status empty">
                    <h3>Waiting for a document</h3>
                    <p>
                      Upload a PDF to prepare its teaching plan and visual
                      guidance.
                    </p>
                  </div>
                )}
              </div>
              {!documentPreparationExpanded && (
                <p className="insight-card-summary">
                  {documentPreparationSummary}
                </p>
              )}
            </section>

            <section
              className={`insight-card takeaways-card${
                pageContextExpanded ? "" : " collapsed"
              }`}
              id="key-takeaways"
            >
              <InsightCardHeader
                title="Page Context"
                icon={
                  <ScanText
                    size={19}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                }
                expanded={pageContextExpanded}
                contentId="page-context-content"
                onToggle={() =>
                  setPageContextExpanded((expanded) => !expanded)
                }
              />
              <div
                className="insight-card-content"
                id="page-context-content"
                hidden={!pageContextExpanded}
              >
                <p className="context-section-label">
                  Current page · {currentPage}
                </p>
                <ul>{renderCurrentConcepts()}</ul>
                <p className="context-section-label">Useful later</p>
                <ul className="future-context-list">
                  {renderFutureConnections()}
                </ul>
                <button
                  className="primary-button analysis-button"
                  type="button"
                  onClick={() => setModal("analysis")}
                  disabled={!activeTutorial}
                >
                  View Teaching Blueprint
                </button>
              </div>
              {!pageContextExpanded && (
                <p className="insight-card-summary">{pageContextSummary}</p>
              )}
            </section>

            <section
              className={`insight-card session-card${
                learningPathExpanded ? "" : " collapsed"
              }`}
              id="session-log"
            >
              <InsightCardHeader
                title="Learning path"
                icon={
                  <Route size={19} strokeWidth={2} aria-hidden="true" />
                }
                expanded={learningPathExpanded}
                contentId="learning-path-content"
                onToggle={() =>
                  setLearningPathExpanded((expanded) => !expanded)
                }
              />
              <div
                className="insight-card-content"
                id="learning-path-content"
                hidden={!learningPathExpanded}
              >
                <LearningPath
                  key={teachingPlan?.document_id ?? "learning-path"}
                  plan={teachingPlan}
                  progress={learningProgress}
                  activeUnitId={activeUnit?.id ?? null}
                  completedLessonStepIds={
                    realtimeTutor.completedLessonStepIds
                  }
                  readyLessonStepId={realtimeTutor.readyLessonStepId}
                  tutorSessionActive={tutorSessionActive}
                />
                {realtimeTutor.error && (
                  <p className="tutor-error" role="alert">
                    {realtimeTutor.error}
                  </p>
                )}
                {activeTutorial && learningProgress && (
                  <button
                    className="secondary-button reset-progress-button"
                    type="button"
                    onClick={() => setModal("reset-progress")}
                    disabled={
                      masteredUnitCount === 0 || tutorSessionActive
                    }
                    title={
                      tutorSessionActive
                        ? "End the current tutor session before resetting progress."
                        : undefined
                    }
                  >
                    <RotateCcw size={17} />
                    Reset progress
                  </button>
                )}
              </div>
              {!learningPathExpanded && (
                <p className="insight-card-summary">{learningPathSummary}</p>
              )}
            </section>
          </aside>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" role="presentation">
          <section
            className={`modal${modal === "analysis" ? " teaching-plan-modal" : ""}${modal === "transcript" ? " transcript-modal" : ""}${modal === "settings" ? " settings-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={closeModal}
              aria-label="Close dialog"
              disabled={modalBusy}
            >
              <X size={21} />
            </button>

            {modal === "analysis" && (
              <>
                <div className="modal-icon">
                  <Sparkles size={23} />
                </div>
                <p className="modal-eyebrow">Teaching blueprint</p>
                <h2 id="modal-title">
                  {activeTutorial?.map.title ?? "Teaching plan"}
                </h2>
                <p className="modal-copy">
                  A single preparation pass mapped the full PDF and ordered the
                  material by learning dependency instead of page number.
                </p>
                <div className="analysis-grid">
                  <div>
                    <span>PDF pages</span>
                    <strong>{activeTutorial?.map.page_count ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Concepts</span>
                    <strong>{activeTutorial?.map.concept_count ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Teaching units</span>
                    <strong>
                      {activeTutorial?.plan.unit_count ?? "—"}
                    </strong>
                  </div>
                </div>
                <div className="teaching-plan-content">
                  <TeachingPlanContent
                    plan={teachingPlan}
                    loading={documentLoading}
                    error={documentError}
                  />
                </div>
                <button
                  className="primary-button modal-button"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Continue Learning
                </button>
              </>
            )}

            {modal === "settings" && (
              <>
                <div className="modal-icon">
                  <Settings size={23} />
                </div>
                <p className="modal-eyebrow">Learning preferences</p>
                <h2 id="modal-title">Settings</h2>
                <div className="settings-list">
                  <section className="setting-field">
                    <div>
                      <label htmlFor="raise-hand-shortcut">
                        Raise-hand shortcut
                      </label>
                      <p>
                        Use the same key to interrupt and finish speaking.
                      </p>
                    </div>
                    <button
                      id="raise-hand-shortcut"
                      className={
                        recordingShortcut ? "recording-shortcut" : ""
                      }
                      type="button"
                      onClick={() => {
                        setRecordingShortcut((recording) => !recording);
                        setSettingsError("");
                      }}
                      onKeyDown={
                        recordingShortcut
                          ? recordRaiseHandShortcut
                          : undefined
                      }
                    >
                      {recordingShortcut
                        ? "Press a key…"
                        : raiseHandShortcutLabel}
                    </button>
                  </section>

                  <section className="setting-field">
                    <div>
                      <label htmlFor="audio-input-device">
                        Microphone
                      </label>
                      <p>The device that listens when your hand is raised.</p>
                    </div>
                    <select
                      id="audio-input-device"
                      value={audioInputDeviceId}
                      onChange={(event) =>
                        void changeAudioInputDevice(event.target.value)
                      }
                      disabled={
                        audioSettingsDisabled ||
                        audioDevicesLoading ||
                        changingAudioDevice !== null
                      }
                    >
                      <option value="">System default</option>
                      {audioInputDevices.map((device, index) => (
                        <option
                          key={device.deviceId}
                          value={device.deviceId}
                        >
                          {getAudioDeviceLabel(
                            device,
                            "Microphone",
                            index,
                          )}
                        </option>
                      ))}
                    </select>
                  </section>

                  <section className="setting-field">
                    <div>
                      <label htmlFor="audio-output-device">Speaker</label>
                      <p>The device used for the tutor&apos;s voice.</p>
                    </div>
                    <select
                      id="audio-output-device"
                      value={audioOutputDeviceId}
                      onChange={(event) =>
                        void changeAudioOutputDevice(event.target.value)
                      }
                      disabled={
                        audioSettingsDisabled ||
                        audioDevicesLoading ||
                        changingAudioDevice !== null
                      }
                    >
                      <option value="">System default</option>
                      {audioOutputDevices.map((device, index) => (
                        <option
                          key={device.deviceId}
                          value={device.deviceId}
                        >
                          {getAudioDeviceLabel(
                            device,
                            "Speaker",
                            index,
                          )}
                        </option>
                      ))}
                    </select>
                  </section>
                </div>
                {audioDevicesLoading && (
                  <p className="settings-status">Loading audio devices…</p>
                )}
                {audioSettingsDisabled && (
                  <p className="settings-status">
                    Audio devices cannot change while connecting or speaking.
                  </p>
                )}
                {settingsError && (
                  <p className="modal-error" role="alert">
                    {settingsError}
                  </p>
                )}
                <button
                  className="primary-button modal-button"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Done
                </button>
              </>
            )}

            {modal === "shortcuts" && (
              <>
                <div className="modal-icon">
                  <Keyboard size={23} />
                </div>
                <p className="modal-eyebrow">Quick controls</p>
                <h2 id="modal-title">Keyboard shortcuts</h2>
                <div className="shortcut-list">
                  <p>
                    <span>Raise hand or finish speaking</span>
                    <kbd>{raiseHandShortcutLabel}</kbd>
                  </p>
                  <p>
                    <span>Open teaching blueprint</span>
                    <kbd>A</kbd>
                  </p>
                  <p>
                    <span>Open tutor transcript</span>
                    <kbd>T</kbd>
                  </p>
                  <p>
                    <span>End learning session</span>
                    <kbd>E</kbd>
                  </p>
                </div>
                <button
                  className="primary-button modal-button"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Got It
                </button>
              </>
            )}

            {modal === "transcript" && (
              <>
                <div className="modal-icon">
                  <MessageSquareText size={23} />
                </div>
                <p className="modal-eyebrow">Session transcript</p>
                <h2 id="modal-title">What the tutor has said</h2>
                <div className="transcript-content" role="log">
                  {realtimeTutor.tutorTranscripts.length > 0 ? (
                    realtimeTutor.tutorTranscripts.map(
                      (transcript, index) => (
                        <article key={`${index}:${transcript}`}>
                          <small>Tutor · turn {index + 1}</small>
                          <p>{transcript}</p>
                        </article>
                      ),
                    )
                  ) : (
                    <p className="transcript-empty">
                      The tutor has not spoken yet.
                    </p>
                  )}
                </div>
                <button
                  className="primary-button modal-button"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Continue Learning
                </button>
              </>
            )}

            {modal === "end-session" && (
              <>
                <div className="modal-icon danger">
                  <Pause size={23} />
                </div>
                <p className="modal-eyebrow">Session control</p>
                <h2 id="modal-title">End this learning session?</h2>
                <p className="modal-copy">
                  Your learning progress is already saved.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setModal(null)}
                  >
                    Keep Learning
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={confirmEndSession}
                  >
                    <Check size={19} />
                    End Session
                  </button>
                </div>
              </>
            )}

            {modal === "delete-tutorial" && (
              <>
                <div className="modal-icon danger">
                  <Trash2 size={23} />
                </div>
                <p className="modal-eyebrow">Tutorial management</p>
                <h2 id="modal-title">Delete this tutorial?</h2>
                <p className="modal-copy">
                  <strong>{activeTutorial?.title}</strong> and its source PDF,
                  teaching materials, and learning progress will be permanently
                  deleted from this machine.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={deletingTutorial}
                  >
                    Keep Tutorial
                  </button>
                  <button
                    className="primary-button danger-button"
                    type="button"
                    onClick={deleteTutorial}
                    disabled={deletingTutorial}
                  >
                    <Trash2 size={19} />
                    {deletingTutorial ? "Deleting…" : "Delete Tutorial"}
                  </button>
                </div>
              </>
            )}

            {modal === "reset-progress" && (
              <>
                <div className="modal-icon danger">
                  <RotateCcw size={23} />
                </div>
                <p className="modal-eyebrow">Tutorial progress</p>
                <h2 id="modal-title">Reset learning progress?</h2>
                <p className="modal-copy">
                  This resets the entire learning path, clearing{" "}
                  {masteredUnitCount} mastered{" "}
                  {masteredUnitCount === 1 ? "unit" : "units"} and all
                  mastery evidence. The PDF and its prepared teaching
                  materials will remain available.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={closeModal}
                    disabled={resettingProgress}
                  >
                    Keep Progress
                  </button>
                  <button
                    className="primary-button danger-button"
                    type="button"
                    onClick={resetProgress}
                    disabled={resettingProgress}
                  >
                    <RotateCcw size={19} />
                    {resettingProgress ? "Resetting…" : "Reset Progress"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <div className={`toast${toast ? " visible" : ""}`} aria-live="polite">
        {toast}
      </div>
    </main>
  );
}

function useLocalSetting(key: string, fallback: string) {
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(key) ?? fallback,
    [fallback, key],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  return useSyncExternalStore(
    subscribeToLocalSettings,
    getSnapshot,
    getServerSnapshot,
  );
}

function subscribeToLocalSettings(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCAL_SETTINGS_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCAL_SETTINGS_EVENT, onStoreChange);
  };
}

function saveLocalSetting(key: string, value: string) {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(LOCAL_SETTINGS_EVENT));
}

function normalizeShortcut(
  event: ReactKeyboardEvent<HTMLButtonElement>,
) {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return null;
  }

  const key = event.key.toLowerCase();
  return key === " " || /^[a-z0-9]$/.test(key) ? key : null;
}

function formatShortcut(shortcut: string) {
  return shortcut === " " ? "Space" : shortcut.toUpperCase();
}

function getAudioDeviceLabel(
  device: MediaDeviceInfo,
  fallback: "Microphone" | "Speaker",
  index: number,
) {
  return device.label || `${fallback} ${index + 1}`;
}

function TutorTranscriptCard({
  transcript,
  isActive,
  isStreaming,
  expanded,
  onToggle,
}: {
  transcript: string;
  isActive: boolean;
  isStreaming: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hasNewTextBelow, setHasNewTextBelow] = useState(false);
  let status = "Inactive";

  if (isActive) {
    status = isStreaming ? "Live" : "Current turn";
  }

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!transcript) {
        viewport.scrollTop = 0;
      }

      setHasNewTextBelow(
        Boolean(transcript) && hasScrollableContentBelow(viewport),
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [transcript]);

  function handleScroll() {
    const viewport = viewportRef.current;

    if (viewport) {
      setHasNewTextBelow(hasScrollableContentBelow(viewport));
    }
  }

  function showNewestText() {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }

  return (
    <section
      className={`insight-card live-transcript-card${
        expanded ? "" : " collapsed"
      }`}
      aria-label="Tutor transcript"
    >
      <InsightCardHeader
        title="Tutor transcript"
        icon={<MessageSquareText size={18} aria-hidden="true" />}
        status={
          <span
            className={`live-transcript-status${
              isStreaming ? " streaming" : ""
            }`}
          >
            {status}
          </span>
        }
        expanded={expanded}
        contentId="live-transcript-content"
        onToggle={onToggle}
        disabled={!isActive}
      />
      <div
        className="live-transcript-canvas"
        id="live-transcript-content"
        hidden={!expanded}
      >
        <div
          ref={viewportRef}
          className="live-transcript-viewport"
          onScroll={handleScroll}
          aria-label="Current tutor response"
          role="region"
          tabIndex={0}
        >
          {transcript ? (
            <p>{transcript}</p>
          ) : (
            <p className="live-transcript-placeholder">
              {isStreaming
                ? "The tutor is preparing a response…"
                : "The tutor’s next response will appear here."}
            </p>
          )}
        </div>
        {hasNewTextBelow && (
          <button
            className="new-transcript-text-button"
            type="button"
            onClick={showNewestText}
          >
            New text below
            <ArrowDown size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

function hasScrollableContentBelow(element: HTMLElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight > 1
  );
}

function InsightCardHeader({
  title,
  icon,
  status,
  expanded,
  contentId,
  onToggle,
  disabled = false,
}: {
  title: string;
  icon?: ReactNode;
  status?: ReactNode;
  expanded: boolean;
  contentId: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <h2 className="insight-card-header">
      <button
        className="insight-card-toggle"
        type="button"
        onClick={onToggle}
        aria-controls={contentId}
        aria-expanded={expanded}
        disabled={disabled}
      >
        <span className="insight-card-title">
          {icon && <span className="insight-card-icon">{icon}</span>}
          <span>{title}</span>
        </span>
        <span className="insight-card-controls">
          {status}
          <ChevronRight
            className="insight-card-chevron"
            size={17}
            aria-hidden="true"
          />
        </span>
      </button>
    </h2>
  );
}

function LearningPath({
  plan,
  progress,
  activeUnitId,
  completedLessonStepIds,
  readyLessonStepId,
  tutorSessionActive,
}: {
  plan: TeachingPlan | null;
  progress: LearningProgress | null;
  activeUnitId: string | null;
  completedLessonStepIds: string[];
  readyLessonStepId: string | null;
  tutorSessionActive: boolean;
}) {
  const [expandedUnitIds, setExpandedUnitIds] = useState(
    () => new Set(activeUnitId ? [activeUnitId] : []),
  );
  const previousActiveUnitIdRef = useRef(activeUnitId);

  useEffect(() => {
    const previousActiveUnitId = previousActiveUnitIdRef.current;

    if (previousActiveUnitId === activeUnitId) {
      return;
    }

    setExpandedUnitIds((expandedIds) => {
      const nextExpandedIds = new Set(expandedIds);

      if (previousActiveUnitId) {
        nextExpandedIds.delete(previousActiveUnitId);
      }

      if (activeUnitId) {
        nextExpandedIds.add(activeUnitId);
      }

      return nextExpandedIds;
    });
    previousActiveUnitIdRef.current = activeUnitId;
  }, [activeUnitId]);

  if (!plan || !progress) {
    return <p className="learning-path-status">Learning progress is loading.</p>;
  }

  const masteredUnitIds = new Set(
    Object.keys(progress.unit_progress),
  );
  const completedStepIds = new Set(completedLessonStepIds);
  const masteredCount = masteredUnitIds.size;
  const activeUnit = plan.units.find(
    (unit) => unit.id === activeUnitId,
  );

  function toggleUnit(unitId: string) {
    setExpandedUnitIds((expandedIds) => {
      const nextExpandedIds = new Set(expandedIds);

      if (nextExpandedIds.has(unitId)) {
        nextExpandedIds.delete(unitId);
      } else {
        nextExpandedIds.add(unitId);
      }

      return nextExpandedIds;
    });
  }

  return (
    <>
      <div className="learning-path-summary">
        <strong>
          {activeUnit?.title ?? "Teaching blueprint mastered"}
        </strong>
        <span>
          {masteredCount} of {plan.units.length} units mastered
        </span>
      </div>
      <ol className="learning-path-list">
        {plan.units.map((unit, unitIndex) => {
          const isMastered = masteredUnitIds.has(unit.id);
          const isActive = unit.id === activeUnitId;
          const isInProgress = isActive && tutorSessionActive;
          let unitStatus = "upcoming";
          let unitStatusLabel = "Upcoming";

          if (isMastered) {
            unitStatus = "mastered";
            unitStatusLabel = "Mastered";
          } else if (isActive) {
            unitStatus = "active";
            unitStatusLabel = isInProgress ? "In progress" : "Ready";
          }

          const isExpanded = expandedUnitIds.has(unit.id);
          const stepListId = `learning-path-unit-${unitIndex}`;
          const currentStepId = isInProgress
            ? unit.lesson_steps.find(
                (step) => !completedStepIds.has(step.id),
              )?.id
            : null;

          return (
            <li
              className={`learning-path-unit ${unitStatus}`}
              key={unit.id}
            >
              <button
                className="learning-path-unit-toggle"
                type="button"
                onClick={() => toggleUnit(unit.id)}
                aria-controls={stepListId}
                aria-expanded={isExpanded}
              >
                <span
                  className="learning-path-unit-marker"
                  aria-hidden="true"
                >
                  {isMastered ? (
                    <Check size={15} strokeWidth={2.7} />
                  ) : (
                    unitIndex + 1
                  )}
                </span>
                <span className="learning-path-unit-copy">
                  <strong>{unit.title}</strong>
                  <small>
                    {unitStatusLabel} · {unit.lesson_steps.length} steps
                  </small>
                </span>
                <ChevronRight
                  className="learning-path-chevron"
                  size={17}
                  aria-hidden="true"
                />
              </button>
              {isExpanded && (
                <div className="learning-path-unit-steps" id={stepListId}>
                  <ol>
                    {unit.lesson_steps.map((step) => {
                      let stepStatus = "upcoming";
                      let stepStatusLabel = "Upcoming";

                      if (isMastered || completedStepIds.has(step.id)) {
                        stepStatus = "covered";
                        stepStatusLabel = "Covered";
                      } else if (step.id === currentStepId) {
                        stepStatus = "current";
                        stepStatusLabel =
                          step.id === readyLessonStepId
                            ? "Ready"
                            : "Current";
                      }

                      return (
                        <li
                          className={`learning-path-step ${stepStatus}`}
                          key={step.id}
                          aria-current={
                            stepStatus === "current"
                              ? "step"
                              : undefined
                          }
                        >
                          <span
                            className="learning-path-step-marker"
                            aria-hidden="true"
                          >
                            {stepStatus === "covered" && (
                              <Check size={12} strokeWidth={2.8} />
                            )}
                          </span>
                          <span className="learning-path-step-copy">
                            <small>
                              {formatLessonStepKind(step.kind)}
                            </small>
                            <strong>{step.title}</strong>
                          </span>
                          <small className="learning-path-step-status">
                            {stepStatusLabel}
                          </small>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function TeachingPlanContent({
  plan,
  loading,
  error,
}: {
  plan: TeachingPlan | null;
  loading: boolean;
  error: string;
}) {
  if (loading) {
    return <p className="teaching-plan-status">Loading teaching units…</p>;
  }

  if (error) {
    return (
      <p className="modal-error" role="alert">
        {error}
      </p>
    );
  }

  if (!plan) {
    return (
      <p className="teaching-plan-status">
        No teaching blueprint is available.
      </p>
    );
  }

  const unitTitlesById = new Map(
    plan.units.map((unit) => [unit.id, unit.title]),
  );

  return (
    <ol className="teaching-plan-list">
      {plan.units.map((unit, index) => (
        <TeachingUnitCard
          key={unit.id}
          unit={unit}
          index={index}
          unitTitlesById={unitTitlesById}
        />
      ))}
    </ol>
  );
}

function TeachingUnitCard({
  unit,
  index,
  unitTitlesById,
}: {
  unit: TeachingUnit;
  index: number;
  unitTitlesById: ReadonlyMap<string, string>;
}) {
  const sourcePageLabels = Array.from(
    new Set(unit.source_anchors.map((anchor) => anchor.page_label)),
  ).join(", ");
  const prerequisiteTitles = unit.prerequisite_unit_ids.length
    ? unit.prerequisite_unit_ids
        .map((id) => unitTitlesById.get(id) ?? id)
        .join(", ")
    : "None";

  return (
    <li className="teaching-unit">
      <div className="teaching-unit-heading">
        <span>{index + 1}</span>
        <div>
          <h3>{unit.title}</h3>
          <small>
            {unit.concept_ids.map(formatConceptId).join(" · ")}
          </small>
        </div>
      </div>
      <p className="teaching-unit-objective">{unit.objective}</p>
      <dl className="teaching-unit-meta">
        <div>
          <dt>Pages</dt>
          <dd>{sourcePageLabels}</dd>
        </div>
        <div>
          <dt>Prerequisites</dt>
          <dd>{prerequisiteTitles}</dd>
        </div>
      </dl>
      <div className="teaching-unit-details">
        <section>
          <h4>Lesson outline</h4>
          <ol className="teaching-unit-steps">
            {unit.lesson_steps.map((step) => (
              <li key={step.id}>
                <strong>
                  {formatLessonStepKind(step.kind)} · {step.title}
                </strong>
                <p>{step.content}</p>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h4>Mastery criteria</h4>
          <ul>
            {unit.mastery_criteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </section>
      </div>
      {unit.common_difficulties.length > 0 && (
        <p className="teaching-unit-difficulties">
          <strong>Common difficulties:</strong>{" "}
          {unit.common_difficulties.join(" ")}
        </p>
      )}
    </li>
  );
}

function formatConceptId(conceptId: string) {
  return conceptId.replace("concept:", "").replaceAll("-", " ");
}

function formatLessonStepKind(kind: string) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function getInitialUnitPageIndex(unit: TeachingUnit) {
  const firstVisualAnchorId = unit.lesson_steps.find(
    (step) => step.visual_source_anchor_id !== null,
  )?.visual_source_anchor_id;
  const firstVisualAnchor = unit.source_anchors.find(
    (anchor) => anchor.id === firstVisualAnchorId,
  );

  return firstVisualAnchor?.page_index ?? unit.source_anchors[0].page_index;
}

function getLatestTutorQuestion(transcript: string) {
  const sentences =
    transcript
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+(?:[.!?]+["'’”)\]]*|$)/g) ?? [];

  return (
    sentences
      .map((sentence) => sentence.trim())
      .filter((sentence) => /\?["'’”)\]]*$/.test(sentence))
      .at(-1) ?? ""
  );
}

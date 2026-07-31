"use client";

import {
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Hand,
  History,
  Keyboard,
  LogOut,
  MessageSquareText,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { PdfDocumentViewer } from "@/app/pdf-document-viewer";
import type { DocumentLayout } from "@/lib/document-layout";
import type {
  DocumentModel,
  DocumentMapSummary,
  PageLearningContext,
} from "@/lib/document-model";
import {
  findActiveTeachingUnit,
  type LearningProgress,
} from "@/lib/learning-progress";
import type { TeachingGrounding } from "@/lib/teaching-grounding";
import type {
  TeachingPlan,
  TeachingPlanSummary,
  TeachingUnit,
} from "@/lib/teaching-plan";
import { useRealtimeTutor } from "@/lib/use-realtime-tutor";

type NavSection = "Dashboard" | "Courses" | "Library";
type Modal =
  | "analysis"
  | "transcript"
  | "shortcuts"
  | "end-session"
  | "prepare-document"
  | "reset-progress"
  | "remove-document"
  | null;
type Popover = "settings" | "profile" | null;
type UploadedDocument = {
  id: string;
  name: string;
  type: "pdf";
  url: string;
  map: DocumentMapSummary;
  plan: TeachingPlanSummary;
};

const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_PDF_SIZE = 10 * BYTES_PER_MEGABYTE;

export default function Home() {
  const [activeSection, setActiveSection] =
    useState<NavSection>("Dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [popover, setPopover] = useState<Popover>(null);
  const [timerRunning, setTimerRunning] = useState(true);
  const [insightsVisible, setInsightsVisible] = useState(true);
  const [toast, setToast] = useState("");
  const [activeDocument, setActiveDocument] =
    useState<UploadedDocument | null>(null);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingDocument, setRemovingDocument] = useState(false);
  const [resettingProgress, setResettingProgress] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageContext, setPageContext] =
    useState<PageLearningContext | null>(null);
  const [pageContextLoading, setPageContextLoading] = useState(false);
  const [pageContextError, setPageContextError] = useState("");
  const [teachingPlan, setTeachingPlan] =
    useState<TeachingPlan | null>(null);
  const [documentLayout, setDocumentLayout] =
    useState<DocumentLayout | null>(null);
  const [teachingGrounding, setTeachingGrounding] =
    useState<TeachingGrounding | null>(null);
  const [documentModel, setDocumentModel] =
    useState<DocumentModel | null>(null);
  const [learningProgress, setLearningProgress] =
    useState<LearningProgress | null>(null);
  const [teachingPlanLoading, setTeachingPlanLoading] = useState(false);
  const [teachingPlanError, setTeachingPlanError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUnit =
    teachingPlan && learningProgress
      ? findActiveTeachingUnit(teachingPlan, learningProgress)
      : null;
  const realtimeTutor = useRealtimeTutor({
    documentId: activeDocument?.id ?? null,
    documentUrl: activeDocument?.url ?? null,
    documentLayout,
    documentModel,
    teachingPlan,
    teachingGrounding,
    activeUnit,
    onPageChange: setCurrentPage,
    onProgressChange: setLearningProgress,
  });
  const sessionEnded = realtimeTutor.status === "ended";
  const tutorSessionActive =
    realtimeTutor.status === "connecting" ||
    realtimeTutor.status === "connected";
  const modalBusy =
    (modal === "prepare-document" && uploading) ||
    (modal === "reset-progress" && resettingProgress);
  const isUserTurn = realtimeTutor.isUserTurn;
  let userTurnActionLabel = "Raise hand to speak";

  if (realtimeTutor.isSubmittingUserTurn) {
    userTurnActionLabel = "Sending answer";
  } else if (isUserTurn) {
    userTurnActionLabel = "Done speaking";
  }

  const liveTutorCaption = realtimeTutor.tutorCaption;
  const masteredUnitCount = learningProgress
    ? Object.keys(learningProgress.unit_progress).length
    : 0;
  const activeUnitNumber =
    activeUnit && teachingPlan
      ? teachingPlan.units.findIndex((unit) => unit.id === activeUnit.id) + 1
      : 0;
  const tutorialComplete =
    teachingPlan !== null &&
    learningProgress !== null &&
    activeUnit === null;

  useEffect(() => {
    const controller = new AbortController();

    async function loadDocument() {
      try {
        const response = await fetch("/api/document", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("The saved document could not be loaded.");
        }

        const data = (await response.json()) as {
          document: UploadedDocument | null;
        };
        setActiveDocument(data.document);
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

    loadDocument();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeDocument) {
      return;
    }

    const controller = new AbortController();

    async function loadPageContext() {
      setPageContextLoading(true);
      setPageContextError("");

      try {
        const response = await fetch(
          `/api/document/context?page=${currentPage}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          context?: PageLearningContext;
          message?: string;
        };

        if (!response.ok || !data.context) {
          throw new Error(
            data.message ?? "The page context could not be loaded.",
          );
        }

        setPageContext(data.context);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setPageContextError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setPageContextLoading(false);
        }
      }
    }

    loadPageContext();
    return () => controller.abort();
  }, [activeDocument, currentPage]);

  useEffect(() => {
    if (!activeDocument) {
      return;
    }

    const controller = new AbortController();

    async function loadTutorialData() {
      setTeachingPlanLoading(true);
      setTeachingPlanError("");
      setTeachingPlan(null);
      setDocumentLayout(null);
      setTeachingGrounding(null);
      setDocumentModel(null);
      setLearningProgress(null);

      try {
        const [
          planResponse,
          mapResponse,
          layoutResponse,
          groundingResponse,
          progressResponse,
        ] =
          await Promise.all([
            fetch("/api/document/plan", { signal: controller.signal }),
            fetch("/api/document/map", { signal: controller.signal }),
            fetch("/api/document/layout", {
              signal: controller.signal,
            }),
            fetch("/api/document/grounding", {
              signal: controller.signal,
            }),
            fetch("/api/document/progress", {
              signal: controller.signal,
            }),
          ]);
        const planData = (await planResponse.json()) as {
          plan?: TeachingPlan;
          message?: string;
        };
        const mapData = (await mapResponse.json()) as {
          model?: DocumentModel;
          message?: string;
        };
        const layoutData = (await layoutResponse.json()) as {
          layout?: DocumentLayout;
          message?: string;
        };
        const groundingData = (await groundingResponse.json()) as {
          grounding?: TeachingGrounding;
          message?: string;
        };
        const progressData = (await progressResponse.json()) as {
          progress?: LearningProgress;
          message?: string;
        };

        if (!planResponse.ok || !planData.plan) {
          throw new Error(
            planData.message ?? "The teaching blueprint could not be loaded.",
          );
        }

        if (!mapResponse.ok || !mapData.model) {
          throw new Error(
            mapData.message ?? "The document map could not be loaded.",
          );
        }

        if (!layoutResponse.ok || !layoutData.layout) {
          throw new Error(
            layoutData.message ?? "The document layout could not be loaded.",
          );
        }

        if (!groundingResponse.ok || !groundingData.grounding) {
          throw new Error(
            groundingData.message ??
              "The teaching grounding could not be loaded.",
          );
        }

        if (!progressResponse.ok || !progressData.progress) {
          throw new Error(
            progressData.message ?? "Learning progress could not be loaded.",
          );
        }

        setTeachingPlan(planData.plan);
        setDocumentLayout(layoutData.layout);
        setTeachingGrounding(groundingData.grounding);
        setDocumentModel(mapData.model);
        setLearningProgress(progressData.progress);
        const initialUnit = findActiveTeachingUnit(
          planData.plan,
          progressData.progress,
        );

        if (initialUnit) {
          setCurrentPage(initialUnit.source_anchors[0].page_index);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setTeachingPlanError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setTeachingPlanLoading(false);
        }
      }
    }

    loadTutorialData();
    return () => controller.abort();
  }, [activeDocument]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  function selectSection(section: NavSection) {
    setActiveSection(section);
    if (section !== "Dashboard") {
      showToast(`${section} is selected and ready for future content.`);
    }
  }

  function toggleTimer() {
    setTimerRunning((running) => !running);
    showToast(timerRunning ? "Focus timer paused." : "Focus timer resumed.");
  }

  function togglePopover(nextPopover: "settings" | "profile") {
    setPopover((currentPopover) =>
      currentPopover === nextPopover ? null : nextPopover,
    );
  }

  const toggleUserTurn = useCallback(async () => {
    const actionSucceeded = await realtimeTutor.toggleUserTurn();

    if (actionSucceeded) {
      showToast(
        isUserTurn
          ? "Answer sent. Waiting for the tutor."
          : "Microphone on. Click again when you finish speaking.",
      );
    }
  }, [isUserTurn, realtimeTutor, showToast]);

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
        isInteractiveTarget
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (modalBusy) {
        return;
      }

      if (modal === "prepare-document") {
        if (key === "escape" && !uploading) {
          setPendingFile(null);
          setDocumentError("");
          setModal(null);
        }

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
        key === " " &&
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
    realtimeTutor.status,
    realtimeTutor.tutorTranscripts.length,
    sessionEnded,
    toggleUserTurn,
    uploading,
  ]);

  function downloadDocument() {
    if (!activeDocument) {
      return;
    }

    const link = document.createElement("a");
    link.href = `${activeDocument.url}?download=1`;
    link.click();
    showToast("Document download started.");
  }

  function selectDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isPdf(file)) {
      const message = "Only PDF files are supported.";
      setDocumentError(message);
      showToast(message);
      return;
    }

    if (file.size > MAX_PDF_SIZE) {
      const message = "The document must be 10 MB or smaller.";
      setDocumentError(message);
      showToast(message);
      return;
    }

    setPendingFile(file);
    setDocumentError("");
    setModal("prepare-document");
  }

  async function prepareDocument() {
    if (!pendingFile) {
      return;
    }

    setUploading(true);
    setDocumentError("");
    showToast("Building the document map, teaching plan, and visual guidance…");

    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const response = await fetch("/api/document", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        document?: UploadedDocument;
        message?: string;
      };

      if (!response.ok || !data.document) {
        throw new Error(data.message ?? "The document could not be uploaded.");
      }

      realtimeTutor.reset();
      setActiveDocument(data.document);
      setCurrentPage(1);
      setPendingFile(null);
      setModal(null);
      showToast(`${data.document.name} is mapped and planned.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The document could not be uploaded.";
      setDocumentError(message);
      showToast(message);
    } finally {
      setUploading(false);
    }
  }

  function closeModal() {
    if (modalBusy) {
      return;
    }

    if (modal === "prepare-document") {
      setPendingFile(null);
      setDocumentError("");
    }

    setModal(null);
  }

  async function resetProgress() {
    setResettingProgress(true);

    try {
      const response = await fetch("/api/document/progress", {
        method: "PUT",
      });
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
        setCurrentPage(firstUnit.source_anchors[0].page_index);
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

  async function removeDocument() {
    setRemovingDocument(true);

    try {
      const response = await fetch("/api/document", { method: "DELETE" });

      if (!response.ok) {
        throw new Error("The document could not be removed.");
      }

      realtimeTutor.reset();
      setActiveDocument(null);
      setCurrentPage(1);
      setPageContext(null);
      setTeachingPlan(null);
      setDocumentLayout(null);
      setTeachingGrounding(null);
      setDocumentModel(null);
      setLearningProgress(null);
      setTeachingPlanError("");
      setDocumentError("");
      setModal(null);
      showToast("Document removed from this machine.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "The document could not be removed.",
      );
    } finally {
      setRemovingDocument(false);
    }
  }

  function confirmEndSession() {
    realtimeTutor.end();
    setTimerRunning(false);
    setModal(null);
    showToast("Session ended.");
  }

  function startNewSession() {
    setTimerRunning(true);
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
        return (
          <>
            <span className="sound-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span
              className={`turn-state-copy${liveTutorCaption ? " tutor-caption-copy" : ""}`}
            >
              <small>Your turn · microphone on</small>
              <strong key={liveTutorCaption || "user-turn"}>
                {liveTutorCaption ||
                  "Click the hand again when you finish speaking"}
              </strong>
            </span>
          </>
        );
      }

      if (realtimeTutor.isSubmittingUserTurn) {
        return (
          <span className="turn-state-copy">
            <small>Your turn</small>
            <strong>Sending your answer…</strong>
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
          <span
            className={`turn-state-copy${liveTutorCaption ? " tutor-caption-copy" : ""}`}
          >
            <small>{tutorTurnLabel}</small>
            <strong key={liveTutorCaption || tutorTurnLabel}>
              {liveTutorCaption || `${tutorTurnLabel}…`}
            </strong>
          </span>
        );
      }

      if (liveTutorCaption) {
        return (
          <span className="turn-state-copy tutor-caption-copy">
            <small>Your turn · raise hand when ready</small>
            <strong key={liveTutorCaption}>{liveTutorCaption}</strong>
          </span>
        );
      }

      return (
        <span className="turn-state-copy">
          <small>Your turn</small>
          <strong>Raise hand when you&apos;re ready</strong>
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
          onClick={startNewSession}
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
        onClick={() => void realtimeTutor.start()}
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
      <header className="topbar">
        <div className="brand-group">
          <a className="brand" href="#lesson" aria-label="NextLearning home">
            <span className="brand-mark" aria-hidden="true">
              N
            </span>
            NextLearning
          </a>
        </div>

        <nav className="main-nav" aria-label="Primary navigation">
          {(["Dashboard", "Courses", "Library"] as NavSection[]).map(
            (section) => (
              <button
                className={activeSection === section ? "nav-link active" : "nav-link"}
                key={section}
                type="button"
                onClick={() => selectSection(section)}
                aria-current={activeSection === section ? "page" : undefined}
              >
                {section}
              </button>
            ),
          )}
        </nav>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={toggleTimer}
            aria-label={timerRunning ? "Pause focus timer" : "Resume focus timer"}
          >
            {timerRunning ? <Clock3 size={24} /> : <Play size={23} />}
          </button>
          <div className="popover-anchor">
            <button
              className="icon-button"
              type="button"
              onClick={() => togglePopover("settings")}
              aria-label="Open learning settings"
              aria-expanded={popover === "settings"}
            >
              <Settings size={25} />
            </button>
            {popover === "settings" && (
              <div className="popover">
                <p className="popover-title">Learning settings</p>
                <button
                  type="button"
                  onClick={() =>
                    showToast("The tutor follows the active teaching unit.")
                  }
                >
                  <span>Tutor scope</span>
                  <strong>Active unit</strong>
                </button>
              </div>
            )}
          </div>
          <div className="popover-anchor">
            <button
              className="avatar"
              type="button"
              onClick={() => togglePopover("profile")}
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
        </div>
      </header>

      <div
        className={`dashboard-layout${insightsVisible ? "" : " insights-hidden"}`}
      >
        <section className="lesson-card" id="lesson" aria-labelledby="lesson-title">
          <div className="lesson-toolbar">
            <div>
              <FileText size={25} aria-hidden="true" />
              <h2 id="lesson-title">
                {activeDocument?.name ?? "Your learning document"}
              </h2>
            </div>
            {activeDocument && (
              <div className="lesson-actions">
                <button
                  className="icon-button small"
                  type="button"
                  onClick={downloadDocument}
                  aria-label="Download document"
                >
                  <Download size={21} />
                </button>
                <button
                  className="icon-button small"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Replace document"
                  disabled={uploading}
                >
                  <Upload size={21} />
                </button>
                <button
                  className="icon-button small danger-icon-button"
                  type="button"
                  onClick={() => setModal("remove-document")}
                  aria-label="Remove document"
                  disabled={removingDocument}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            className="document-input"
            type="file"
            accept=".pdf,application/pdf"
            onChange={selectDocument}
          />

          <div className="document-viewport">
            {documentLoading ? (
              <div className="document-state" aria-live="polite">
                <FileText size={38} aria-hidden="true" />
                <h1>Loading your document…</h1>
              </div>
            ) : activeDocument ? (
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
                      {activeDocument.map.page_count}
                    </span>
                    <button
                      className="icon-button small"
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(
                            activeDocument.map.page_count,
                            page + 1,
                          ),
                        )
                      }
                      disabled={
                        currentPage === activeDocument.map.page_count
                      }
                      aria-label="Next PDF page"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  {realtimeTutor.activeVisualFocus?.page_index ===
                    currentPage && (
                    <div className="pdf-focus-context" aria-live="polite">
                      <small>Now looking at</small>
                      <strong>
                        {realtimeTutor.activeVisualFocus.teaching_point}
                      </strong>
                    </div>
                  )}
                </div>
                <div className="pdf-stage">
                  <PdfDocumentViewer
                    documentId={activeDocument.id}
                    documentUrl={activeDocument.url}
                    documentName={activeDocument.name}
                    pageIndex={currentPage}
                    highlightedBlocks={
                      realtimeTutor.activeVisualFocus?.page_index ===
                      currentPage
                        ? realtimeTutor.activeVisualFocus.blocks
                        : []
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="document-state">
                <span className="document-state-icon">
                  <Upload size={34} aria-hidden="true" />
                </span>
                <p className="document-state-eyebrow">Start learning</p>
                <h1>Upload your first document</h1>
                <p>
                  Choose a PDF up to 10 MB. The full document will be read
                  to prepare its concept map, teaching plan, and visual
                  guidance.
                </p>
                {documentError && (
                  <p className="document-error" role="alert">
                    {documentError}
                  </p>
                )}
                <button
                  className="primary-button upload-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload size={20} />
                  {uploading ? "Preparing…" : "Choose PDF"}
                </button>
              </div>
            )}
          </div>

          <div className={`session-dock${sessionEnded ? " ended" : ""}`}>
            <button
              className={`dock-icon${isUserTurn ? " user-turn" : ""}`}
              type="button"
              onClick={() => void toggleUserTurn()}
              aria-label={userTurnActionLabel}
              aria-pressed={isUserTurn}
              title={userTurnActionLabel}
              disabled={
                realtimeTutor.status !== "connected" ||
                realtimeTutor.isSubmittingUserTurn
              }
            >
              {isUserTurn ? <Mic size={23} /> : <Hand size={23} />}
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
        </section>

        <div className="insights-panel">
          <button
            className="insights-toggle"
            type="button"
            onClick={() => setInsightsVisible((visible) => !visible)}
            aria-label={insightsToggleLabel}
            aria-controls="learning-insights"
            aria-expanded={insightsVisible}
            title={insightsToggleLabel}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <aside
            className="insights-column"
            id="learning-insights"
            aria-label="Learning insights"
          >
            <section className="insight-card understanding-card">
              <div className="card-eyebrow">
                <span>Document preparation</span>
                <span
                  className={`preparation-indicator${activeDocument ? " ready" : ""}`}
                  aria-hidden="true"
                >
                  {activeDocument ? (
                    <Check size={16} strokeWidth={2.5} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                </span>
              </div>
              {activeDocument ? (
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
                      <dd>{activeDocument.map.concept_count}</dd>
                    </div>
                    <div>
                      <dt>Connections</dt>
                      <dd>{activeDocument.map.connection_count}</dd>
                    </div>
                    <div>
                      <dt>Teaching units</dt>
                      <dd>{activeDocument.plan.unit_count}</dd>
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
            </section>

            <section className="insight-card takeaways-card" id="key-takeaways">
              <h2>
                <BrainCircuit size={25} aria-hidden="true" />
                Page Context
              </h2>
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
                disabled={!activeDocument}
              >
                View Teaching Blueprint
              </button>
            </section>

            <section className="insight-card session-card" id="session-log">
              <h2>
                <History size={24} aria-hidden="true" />
                <span>Tutorial progress</span>
              </h2>
              <div className="log-entry">
                <strong>
                  {tutorialComplete
                    ? "Teaching blueprint mastered"
                    : activeUnit?.title ?? "Preparing tutorial"}
                </strong>
                {teachingPlan && learningProgress ? (
                  <p>
                    {masteredUnitCount} of {teachingPlan.units.length} units
                    mastered.
                    {activeUnit &&
                      ` Active unit ${activeUnitNumber} begins on page ${activeUnit.source_anchors[0].page_label}.`}
                  </p>
                ) : (
                  <p>Learning progress is loading.</p>
                )}
                {realtimeTutor.error && (
                  <p className="tutor-error" role="alert">
                    {realtimeTutor.error}
                  </p>
                )}
              </div>
              {activeDocument && learningProgress && (
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
            </section>
          </aside>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" role="presentation">
          <section
            className={`modal${modal === "analysis" ? " teaching-plan-modal" : ""}${modal === "transcript" ? " transcript-modal" : ""}`}
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
                  {activeDocument?.map.title ?? "Teaching plan"}
                </h2>
                <p className="modal-copy">
                  A second planning pass reviewed the full PDF and its validated
                  concept map, then ordered the material by learning dependency
                  instead of page number.
                </p>
                <div className="analysis-grid">
                  <div>
                    <span>PDF pages</span>
                    <strong>{activeDocument?.map.page_count ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Concepts</span>
                    <strong>{activeDocument?.map.concept_count ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Teaching units</span>
                    <strong>
                      {activeDocument?.plan.unit_count ?? "—"}
                    </strong>
                  </div>
                </div>
                <div className="teaching-plan-content">
                  <TeachingPlanContent
                    plan={teachingPlan}
                    loading={teachingPlanLoading}
                    error={teachingPlanError}
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
                    <kbd>Space</kbd>
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
                  This disconnects the live tutor. Mastered units and their
                  evidence remain saved with this document.
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

            {modal === "prepare-document" && pendingFile && (
              <>
                <div className="modal-icon">
                  <Upload size={23} />
                </div>
                <p className="modal-eyebrow">Document preparation</p>
                <h2 id="modal-title">Prepare this PDF?</h2>
                <div className="pending-file">
                  <FileText size={23} aria-hidden="true" />
                  <span>
                    <strong>{pendingFile.name}</strong>
                    <small>{formatFileSize(pendingFile.size)}</small>
                  </span>
                </div>
                <p className="modal-copy">
                  The complete PDF will be sent to Azure OpenAI to build its
                  concept map, ordered teaching plan, and visual grounding. No
                  AI request is made until you continue.
                </p>
                {activeDocument && (
                  <p className="replacement-note">
                    Your current document remains available unless preparation
                    succeeds.
                  </p>
                )}
                {documentError && (
                  <p className="modal-error" role="alert">
                    {documentError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={closeModal}
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={prepareDocument}
                    disabled={uploading}
                  >
                    <Sparkles size={19} />
                    {uploading ? "Preparing…" : "Prepare document"}
                  </button>
                </div>
              </>
            )}

            {modal === "remove-document" && (
              <>
                <div className="modal-icon danger">
                  <Trash2 size={23} />
                </div>
                <p className="modal-eyebrow">Document management</p>
                <h2 id="modal-title">Remove this document?</h2>
                <p className="modal-copy">
                  <strong>{activeDocument?.name}</strong> will be permanently
                  deleted from this machine together with its saved learning
                  progress.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={removingDocument}
                  >
                    Keep Document
                  </button>
                  <button
                    className="primary-button danger-button"
                    type="button"
                    onClick={removeDocument}
                    disabled={removingDocument}
                  >
                    <Trash2 size={19} />
                    {removingDocument ? "Removing…" : "Remove Document"}
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
                  This clears {masteredUnitCount} mastered{" "}
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
          <h4>Teaching guidance</h4>
          <ul>
            {unit.teaching_guidance.map((guidance) => (
              <li key={guidance}>{guidance}</li>
            ))}
          </ul>
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

function formatFileSize(bytes: number) {
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

function isPdf(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension === "pdf" && file.type === "application/pdf";
}

function formatConceptId(conceptId: string) {
  return conceptId.replace("concept:", "").replaceAll("-", " ");
}

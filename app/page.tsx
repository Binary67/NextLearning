"use client";

import {
  BrainCircuit,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  History,
  Keyboard,
  LogOut,
  Mic,
  MicOff,
  Pause,
  Play,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
  ZoomIn,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type NavSection = "Dashboard" | "Courses" | "Library";
type Modal =
  | "analysis"
  | "shortcuts"
  | "end-session"
  | "remove-document"
  | null;
type Popover = "settings" | "profile" | null;
type UploadedDocument = {
  content?: string;
  name: string;
  type: "markdown" | "pdf";
  url: string;
};

const takeaways = [
  "Wave functions describe probability, not exact position.",
  "Superposition allows multiple states to exist simultaneously.",
  "Tunneling occurs due to the wave-like property of matter.",
];

export default function Home() {
  const [activeSection, setActiveSection] =
    useState<NavSection>("Dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [popover, setPopover] = useState<Popover>(null);
  const [isListening, setIsListening] = useState(true);
  const [timerRunning, setTimerRunning] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [insightsVisible, setInsightsVisible] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [compactLesson, setCompactLesson] = useState(false);
  const [toast, setToast] = useState("");
  const [activeDocument, setActiveDocument] =
    useState<UploadedDocument | null>(null);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingDocument, setRemovingDocument] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "escape") {
        setModal(null);
        setPopover(null);
      } else if (key === "a") {
        setModal("analysis");
      } else if (key === "e" && !sessionEnded) {
        setModal("end-session");
      } else if (key === " " && !sessionEnded && modal === null) {
        event.preventDefault();
        setIsListening((listening) => !listening);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modal, sessionEnded]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

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

  function toggleListening() {
    setIsListening((listening) => !listening);
    showToast(isListening ? "Listening paused." : "Listening resumed.");
  }

  function cycleZoom() {
    const nextZoom = zoom >= 120 ? 90 : zoom + 10;
    setZoom(nextZoom);
    showToast(`Lesson zoom set to ${nextZoom}%.`);
  }

  function downloadDocument() {
    if (!activeDocument) {
      return;
    }

    const link = document.createElement("a");
    link.href = `${activeDocument.url}?download=1`;
    link.click();
    showToast("Document download started.");
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploading(true);
    setDocumentError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
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

      setActiveDocument(data.document);
      setZoom(100);
      showToast(`${data.document.name} is ready.`);
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

  async function removeDocument() {
    setRemovingDocument(true);

    try {
      const response = await fetch("/api/document", { method: "DELETE" });

      if (!response.ok) {
        throw new Error("The document could not be removed.");
      }

      setActiveDocument(null);
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
    setSessionEnded(true);
    setIsListening(false);
    setTimerRunning(false);
    setModal(null);
    showToast("Session ended. Your progress has been saved locally.");
  }

  function startNewSession() {
    setSessionEnded(false);
    setIsListening(true);
    setTimerRunning(true);
    showToast("A new learning session has started.");
  }

  const insightsToggleLabel = insightsVisible
    ? "Hide insights"
    : "Show insights";

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
                  onClick={() => setCompactLesson((compact) => !compact)}
                >
                  <span>Reading density</span>
                  <strong>{compactLesson ? "Compact" : "Comfortable"}</strong>
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
                {activeDocument.type === "markdown" && (
                  <>
                    <span className="zoom-level" aria-live="polite">
                      {zoom}%
                    </span>
                    <button
                      className="icon-button small"
                      type="button"
                      onClick={cycleZoom}
                      aria-label="Change document zoom"
                    >
                      <ZoomIn size={21} />
                    </button>
                  </>
                )}
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
            accept=".pdf,.md,.markdown,application/pdf,text/markdown,text/plain"
            onChange={uploadDocument}
          />

          <div className="document-viewport">
            {documentLoading ? (
              <div className="document-state" aria-live="polite">
                <FileText size={38} aria-hidden="true" />
                <h1>Loading your document…</h1>
              </div>
            ) : activeDocument?.type === "markdown" ? (
              <article
                className={`lesson-content markdown-content${compactLesson ? " compact" : ""}`}
                style={{ fontSize: `${zoom}%` }}
              >
                <ReactMarkdown>{activeDocument.content ?? ""}</ReactMarkdown>
              </article>
            ) : activeDocument?.type === "pdf" ? (
              <div className="pdf-content">
                <iframe src={activeDocument.url} title={activeDocument.name} />
              </div>
            ) : (
              <div className="document-state">
                <span className="document-state-icon">
                  <Upload size={34} aria-hidden="true" />
                </span>
                <p className="document-state-eyebrow">Start learning</p>
                <h1>Upload your first document</h1>
                <p>
                  Choose a PDF or Markdown file up to 10 MB. It will be saved
                  locally on this machine.
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
                  {uploading ? "Uploading…" : "Choose document"}
                </button>
              </div>
            )}
          </div>

          <div className={`session-dock${sessionEnded ? " ended" : ""}`}>
            <button
              className={`dock-icon${isListening ? " listening" : ""}`}
              type="button"
              onClick={toggleListening}
              aria-label={isListening ? "Pause microphone" : "Resume microphone"}
              disabled={sessionEnded}
            >
              {isListening ? <Mic size={23} /> : <MicOff size={23} />}
            </button>
            <div className="listening-status" aria-live="polite">
              {sessionEnded ? (
                <span>Session complete</span>
              ) : (
                <>
                  <span className="sound-bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{isListening ? "Listening…" : "Paused"}</strong>
                </>
              )}
            </div>
            <button
              className="dock-icon"
              type="button"
              onClick={() => setModal("shortcuts")}
              aria-label="View keyboard shortcuts"
            >
              <Keyboard size={24} />
            </button>
            {sessionEnded ? (
              <button
                className="primary-button end-button"
                type="button"
                onClick={startNewSession}
              >
                <Play size={20} />
                New Session
              </button>
            ) : (
              <button
                className="primary-button end-button"
                type="button"
                onClick={() => setModal("end-session")}
              >
                <LogOut size={21} />
                End Session
              </button>
            )}
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
                <span>Understanding</span>
                <Sparkles size={21} aria-hidden="true" />
              </div>
              <div className="understanding-summary">
                <div
                  className="progress-ring"
                  role="progressbar"
                  aria-label="Understanding score"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={70}
                >
                  <div>
                    <strong>70%</strong>
                    <span>Optimal</span>
                  </div>
                </div>
                <p>
                  You&apos;re grasping wave mechanics faster than 82% of peers.
                </p>
              </div>
            </section>

            <section className="insight-card takeaways-card" id="key-takeaways">
              <h2>
                <BrainCircuit size={25} aria-hidden="true" />
                Key Takeaways
              </h2>
              <ul>
                {takeaways.map((takeaway) => (
                  <li key={takeaway}>{takeaway}</li>
                ))}
                <li className="waiting">Waiting for next insight…</li>
              </ul>
              <button
                className="primary-button analysis-button"
                type="button"
                onClick={() => setModal("analysis")}
              >
                View Analysis
              </button>
            </section>

            <section className="insight-card session-card" id="session-log">
              <h2>
                <History size={24} aria-hidden="true" />
                <span>Session Log</span>
              </h2>
              <div className="log-entry">
                <strong>AI Tutor • 14:02</strong>
                <p>
                  Explain the difference between classical and quantum
                  probability.
                </p>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close dialog"
            >
              <X size={21} />
            </button>

            {modal === "analysis" && (
              <>
                <div className="modal-icon">
                  <Sparkles size={23} />
                </div>
                <p className="modal-eyebrow">Learning analysis</p>
                <h2 id="modal-title">Your momentum is strong</h2>
                <p className="modal-copy">
                  You understand the core concepts well. Spend a little more time
                  connecting probability density to real measurement outcomes.
                </p>
                <div className="analysis-grid">
                  <div>
                    <span>Concept recall</span>
                    <strong>84%</strong>
                  </div>
                  <div>
                    <span>Session focus</span>
                    <strong>91%</strong>
                  </div>
                  <div>
                    <span>Topic mastery</span>
                    <strong>70%</strong>
                  </div>
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
                    <span>Pause or resume listening</span>
                    <kbd>Space</kbd>
                  </p>
                  <p>
                    <span>Open learning analysis</span>
                    <kbd>A</kbd>
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

            {modal === "end-session" && (
              <>
                <div className="modal-icon danger">
                  <Pause size={23} />
                </div>
                <p className="modal-eyebrow">Session control</p>
                <h2 id="modal-title">End this learning session?</h2>
                <p className="modal-copy">
                  Your current progress and key takeaways will remain available
                  in this browser.
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

            {modal === "remove-document" && (
              <>
                <div className="modal-icon danger">
                  <Trash2 size={23} />
                </div>
                <p className="modal-eyebrow">Document management</p>
                <h2 id="modal-title">Remove this document?</h2>
                <p className="modal-copy">
                  <strong>{activeDocument?.name}</strong> will be permanently
                  deleted from this machine.
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
          </section>
        </div>
      )}

      <div className={`toast${toast ? " visible" : ""}`} aria-live="polite">
        {toast}
      </div>
    </main>
  );
}

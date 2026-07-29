"use client";

import {
  BrainCircuit,
  Check,
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
  User,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useState } from "react";

type NavSection = "Dashboard" | "Courses" | "Library";
type Modal = "analysis" | "shortcuts" | "end-session" | null;
type Popover = "settings" | "profile" | null;

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
  const [zoom, setZoom] = useState(100);
  const [highlightsVisible, setHighlightsVisible] = useState(true);
  const [compactLesson, setCompactLesson] = useState(false);
  const [toast, setToast] = useState("");

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
    showToast(isListening ? "Aura paused listening." : "Aura is listening.");
  }

  function cycleZoom() {
    const nextZoom = zoom >= 120 ? 90 : zoom + 10;
    setZoom(nextZoom);
    showToast(`Lesson zoom set to ${nextZoom}%.`);
  }

  function downloadNotes() {
    const notes = [
      "Aura Learning — Introduction to Wave Mechanics",
      "",
      "1.1 The Schrödinger Equation",
      ...takeaways,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([notes], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "wave-mechanics-notes.txt";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Lesson notes downloaded.");
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

  const highlightClassName = highlightsVisible
    ? undefined
    : "hidden-highlight";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <a className="brand" href="#lesson" aria-label="Aura Learning home">
            Aura Learning
          </a>
          <span className="brand-divider" aria-hidden="true" />
          <p className="active-session">
            <span>Active Session:</span> Quantum Physics 101
          </p>
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
                  onClick={() => setHighlightsVisible((visible) => !visible)}
                >
                  <span>Concept highlights</span>
                  <strong>{highlightsVisible ? "On" : "Off"}</strong>
                </button>
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

      <div className="dashboard-layout">
        <section className="lesson-card" id="lesson" aria-labelledby="lesson-title">
          <div className="lesson-toolbar">
            <div>
              <FileText size={25} aria-hidden="true" />
              <h2 id="lesson-title">Introduction to Wave Mechanics</h2>
            </div>
            <div className="lesson-actions">
              <span className="zoom-level" aria-live="polite">
                {zoom}%
              </span>
              <button
                className="icon-button small"
                type="button"
                onClick={cycleZoom}
                aria-label="Change lesson zoom"
              >
                <ZoomIn size={21} />
              </button>
              <button
                className="icon-button small"
                type="button"
                onClick={downloadNotes}
                aria-label="Download lesson notes"
              >
                <Download size={21} />
              </button>
            </div>
          </div>

          <article
            className={`lesson-content${compactLesson ? " compact" : ""}`}
            style={{ fontSize: `${zoom}%` }}
          >
            <h1>1.1 The Schrödinger Equation</h1>
            <p>
              In quantum mechanics, the Schrödinger equation is a linear partial
              differential equation that governs the wave function of a
              quantum-mechanical system.
            </p>

            <div className="equation" aria-label="Time-dependent Schrödinger equation">
              <span>iℏ ∂/∂t Ψ(r,t) = [ -ℏ²/2m ∇² + V(r,t) ] Ψ(r,t)</span>
            </div>

            <p>
              The{" "}
              <mark className={highlightClassName}>
                Wave Function (Ψ)
              </mark>{" "}
              represents the quantum state of a system. It is a complex-valued
              probability amplitude, and the probabilities for the results of
              measurements made on the system can be derived from it.
            </p>

            <p>
              Crucially, the{" "}
              <mark className={highlightClassName}>
                Principle of Superposition
              </mark>{" "}
              states that any two (or more) quantum states can be added together
              (&quot;superposed&quot;) and the result will be another valid
              quantum state; and conversely, that every quantum state can be
              represented as a sum of two or more other distinct states.
            </p>

            <p>
              When the AI Tutor explains the{" "}
              <mark className={highlightClassName}>
                Probability Density
              </mark>
              , it refers to the squared absolute value of the wave function,
              which gives the likelihood of finding a particle at a specific
              point in space-time.
            </p>

            <div className="quantum-visual" aria-label="Abstract visualization of a quantum wave">
              <div className="wave" />
              <div className="wave wave-two" />
              <span className="particle particle-one" />
              <span className="particle particle-two" />
              <span className="particle particle-three" />
              <p>Probability waves reveal where matter is most likely to appear.</p>
            </div>
          </article>
        </section>

        <aside className="insights-column" aria-label="Learning insights">
          <section className="insight-card understanding-card">
            <div className="card-eyebrow">
              <span>Understanding</span>
              <Sparkles size={21} aria-hidden="true" />
            </div>
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
            <p>You&apos;re grasping wave mechanics faster than 82% of peers.</p>
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
                Explain the difference between classical and quantum probability.
              </p>
            </div>
          </section>
        </aside>
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
              <strong>{isListening ? "Aura is listening…" : "Aura is paused"}</strong>
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
                    <span>Pause or resume Aura</span>
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
          </section>
        </div>
      )}

      <div className={`toast${toast ? " visible" : ""}`} aria-live="polite">
        {toast}
      </div>
    </main>
  );
}

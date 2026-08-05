import { Sparkles } from "lucide-react";

export default function TutorialLoading() {
  return (
    <main className="dashboard-layout">
      <section className="lesson-card">
        <div className="document-state" role="status" aria-live="polite">
          <span className="document-state-icon">
            <Sparkles size={34} aria-hidden="true" />
          </span>
          <p className="document-state-eyebrow">Preparing reader</p>
          <h1>Loading the document</h1>
          <p>Getting its concepts and page context ready.</p>
        </div>
      </section>
      <aside className="insights-column" aria-hidden="true" />
    </main>
  );
}

import { LibraryBig } from "lucide-react";

export default function LibraryLoading() {
  return (
    <main className="library-main">
      <div className="library-state" role="status" aria-live="polite">
        <LibraryBig size={34} aria-hidden="true" />
        <h2>Loading your documents…</h2>
      </div>
    </main>
  );
}

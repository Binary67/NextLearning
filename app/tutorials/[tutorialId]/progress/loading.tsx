import { LoaderCircle } from "lucide-react";

import styles from "./progress.module.css";

export default function TutorialProgressLoading() {
  return (
    <main className={styles.main}>
      <div className={styles.state} role="status" aria-live="polite">
        <span className={styles.stateIcon}>
          <LoaderCircle aria-hidden="true" />
        </span>
        <h2>Loading your progress…</h2>
      </div>
    </main>
  );
}

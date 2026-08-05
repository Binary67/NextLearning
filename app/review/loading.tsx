import { LoaderCircle } from "lucide-react";

import styles from "./review.module.css";

export default function ReviewLoading() {
  return (
    <main className={styles.main}>
      <div className={styles.state} role="status" aria-live="polite">
        <span className={styles.stateIcon}>
          <LoaderCircle aria-hidden="true" />
        </span>
        <h2>Loading your reviews…</h2>
      </div>
    </main>
  );
}

"use client";

import {
  ArrowRight,
  BookOpenCheck,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ReviewQueueItem } from "@/lib/reviews";

import styles from "./review.module.css";

type ReviewQueueResponse = {
  reviews: ReviewQueueItem[];
};

const dueDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
  timeStyle: "short",
});

export function ReviewClient({
  initialReviews,
  initialError,
  initialNow,
}: {
  initialReviews: ReviewQueueItem[];
  initialError: string;
  initialNow: number;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [now, setNow] = useState(initialNow);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const loadReviews = useCallback(() => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const controller = new AbortController();
    refreshControllerRef.current = controller;

    async function refresh() {
      try {
        const response = await fetch("/api/reviews", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as Partial<
          ReviewQueueResponse
        > & {
          message?: string;
        };

        if (!response.ok || !Array.isArray(data.reviews)) {
          throw new Error(
            data.message ?? "Your review queue could not be loaded.",
          );
        }

        setReviews(data.reviews);
        setNow(Date.now());
        setError("");
      } catch (reason) {
        if (
          reason instanceof Error &&
          reason.name !== "AbortError"
        ) {
          setError(reason.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }

        if (refreshControllerRef.current === controller) {
          refreshControllerRef.current = null;
          refreshInFlightRef.current = null;
        }
      }
    }

    const refreshPromise = refresh();
    refreshInFlightRef.current = refreshPromise;

    return refreshPromise;
  }, []);

  useEffect(() => {
    function refreshOnFocus() {
      void loadReviews();
    }

    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      refreshControllerRef.current?.abort();
    };
  }, [loadReviews]);

  return (
    <main className={styles.main}>
      <section
        className={styles.content}
        aria-labelledby="review-title"
        aria-busy={loading}
      >
        <header className={styles.heading}>
          <h1 id="review-title">Review</h1>
          <p>
            Revisit concepts when they are due and strengthen what
            you remember.
          </p>
        </header>

        {loading ? (
          <ReviewState
            icon={<LoaderCircle aria-hidden="true" />}
            title="Loading your reviews…"
            live
          />
        ) : error ? (
          <ReviewState
            icon={<CircleAlert aria-hidden="true" />}
            title="Reviews unavailable"
            message={error}
            alert
          >
            <button
              className={styles.retryButton}
              type="button"
              onClick={() => {
                setLoading(true);
                setError("");
                void loadReviews();
              }}
            >
              <RefreshCw size={17} aria-hidden="true" />
              Try again
            </button>
          </ReviewState>
        ) : reviews.length === 0 ? (
          <ReviewState
            icon={<BookOpenCheck aria-hidden="true" />}
            title="You’re caught up"
            message="There are no concepts due for review right now."
          />
        ) : (
          <>
            <p className={styles.queueSummary} aria-live="polite">
              {formatReviewCount(reviews.length)}
            </p>
            <ol className={styles.reviewList}>
              {reviews.map((review) => (
                <li
                  key={[
                    review.tutorialId,
                    review.conceptId,
                    review.chunkId,
                  ].join(":")}
                >
                  <ReviewCard review={review} now={now} />
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </main>
  );
}

function ReviewState({
  icon,
  title,
  message,
  live = false,
  alert = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  message?: string;
  live?: boolean;
  alert?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={styles.state}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
    >
      <span className={styles.stateIcon}>{icon}</span>
      <h2>{title}</h2>
      {message && <p role={alert ? "alert" : undefined}>{message}</p>}
      {children}
    </div>
  );
}

function ReviewCard({
  review,
  now,
}: {
  review: ReviewQueueItem;
  now: number;
}) {
  const dueContext = getDueContext(review.dueAt, now);
  const reviewHref = `/tutorials/${encodeURIComponent(
    review.tutorialId,
  )}?reviewConcept=${encodeURIComponent(review.conceptId)}`;

  return (
    <article className={styles.card}>
      <p className={styles.tutorialTitle}>{review.tutorialTitle}</p>
      <h2>{review.conceptName}</h2>
      <p className={styles.definition}>{review.definition}</p>

      <dl className={styles.details}>
        <div>
          <dt>Page</dt>
          <dd>{review.pageLabel}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>
            <time dateTime={review.dueAt} title={dueContext.exact}>
              {dueContext.label}
            </time>
          </dd>
        </div>
        <div>
          <dt>Last result</dt>
          <dd>{formatAttemptResult(review.lastResult)}</dd>
        </div>
      </dl>

      {review.misconception && (
        <div className={styles.misconception}>
          <h3>Saved misconception</h3>
          <p>{review.misconception}</p>
        </div>
      )}

      <Link className={styles.reviewLink} href={reviewHref}>
        Start voice review
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </article>
  );
}

function getDueContext(dueAt: string, now: number) {
  const dueDate = new Date(dueAt);

  if (Number.isNaN(dueDate.getTime())) {
    return {
      label: "Due for review",
      exact: "Due date unavailable",
    };
  }

  const overdueMilliseconds = Math.max(
    0,
    now - dueDate.getTime(),
  );
  const overdueMinutes = Math.floor(overdueMilliseconds / 60_000);

  if (overdueMinutes < 1) {
    return {
      label: "Due now",
      exact: dueDateFormatter.format(dueDate),
    };
  }

  if (overdueMinutes < 60) {
    return {
      label: `Overdue by ${formatUnit(overdueMinutes, "minute")}`,
      exact: dueDateFormatter.format(dueDate),
    };
  }

  const overdueHours = Math.floor(overdueMinutes / 60);

  if (overdueHours < 24) {
    return {
      label: `Overdue by ${formatUnit(overdueHours, "hour")}`,
      exact: dueDateFormatter.format(dueDate),
    };
  }

  const overdueDays = Math.floor(overdueHours / 24);

  return {
    label: `Overdue by ${formatUnit(overdueDays, "day")}`,
    exact: dueDateFormatter.format(dueDate),
  };
}

function formatAttemptResult(result: ReviewQueueItem["lastResult"]) {
  if (result === "partial") {
    return "Partially correct";
  }

  return result === "correct" ? "Correct" : "Incorrect";
}

function formatReviewCount(count: number) {
  return `${count} ${count === 1 ? "concept is" : "concepts are"} due`;
}

function formatUnit(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

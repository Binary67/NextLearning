import { ReviewClient } from "@/app/review/review-client";
import {
  readDueReviews,
  type ReviewQueueItem,
} from "@/lib/reviews";

export default async function ReviewPage() {
  const now = new Date();
  let reviews: ReviewQueueItem[] = [];
  let initialError = "";

  try {
    reviews = await readDueReviews(now);
  } catch (error) {
    console.error("Initial review queue could not be loaded:", error);
    initialError = "Your review queue could not be loaded.";
  }

  return (
    <ReviewClient
      initialReviews={reviews}
      initialError={initialError}
      initialNow={now.getTime()}
    />
  );
}

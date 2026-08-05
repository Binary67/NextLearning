import { TutorialWorkspace } from "@/app/tutorial-workspace";

export default async function TutorialPage({
  params,
  searchParams,
}: {
  params: Promise<{ tutorialId: string }>;
  searchParams: Promise<{
    reviewConcept?: string | string[];
  }>;
}) {
  const [{ tutorialId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const reviewConcept =
    typeof query.reviewConcept === "string"
      ? query.reviewConcept
      : query.reviewConcept?.[0];

  return (
    <TutorialWorkspace
      tutorialId={tutorialId}
      reviewConcept={reviewConcept}
    />
  );
}

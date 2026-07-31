import { TutorialWorkspace } from "@/app/tutorial-workspace";

export default async function TutorialPage({
  params,
}: {
  params: Promise<{ tutorialId: string }>;
}) {
  const { tutorialId } = await params;

  return <TutorialWorkspace tutorialId={tutorialId} />;
}

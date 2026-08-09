import { LibraryClient } from "@/app/library/library-client";
import type { ProgressiveTutorialResponse } from "@/app/tutorial-progressive";
import { readTutorialsForPage } from "@/app/server-data";

export default async function LibraryPage() {
  let tutorials: ProgressiveTutorialResponse[] = [];
  let initialError = "";

  try {
    tutorials = (await readTutorialsForPage()) as ProgressiveTutorialResponse[];
  } catch (error) {
    console.error("Initial library data could not be loaded:", error);
    initialError = "Your documents could not be loaded.";
  }

  return (
    <LibraryClient
      initialTutorials={tutorials}
      initialError={initialError}
    />
  );
}

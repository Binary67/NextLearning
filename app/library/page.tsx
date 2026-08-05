import { LibraryClient } from "@/app/library/library-client";
import { readTutorialsForPage } from "@/app/server-data";
import type { TutorialResponse } from "@/lib/tutorial";

export default async function LibraryPage() {
  let tutorials: TutorialResponse[] = [];
  let initialError = "";

  try {
    tutorials = await readTutorialsForPage();
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

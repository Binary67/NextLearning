import { after } from "next/server";

import { listStoredTutorials } from "@/lib/tutorial-storage";
import { hasActiveTutorials } from "@/lib/tutorial-status";
import { readAvailableTutorial } from "@/lib/tutorial";
import { runTutorialQueue } from "@/lib/tutorial-queue";

export const runtime = "nodejs";

export async function GET() {
  const storedTutorials = await listStoredTutorials();
  const tutorials = await Promise.all(
    storedTutorials.map(async ({ id, status }) => {
      const available = await readAvailableTutorial(id);

      return {
        id,
        status,
        availability: available
          ? {
              batchCount: available.publishedBatchCount,
              pageCount: available.model.page_count,
            }
          : null,
      };
    }),
  );

  if (hasActiveTutorials(tutorials)) {
    after(runTutorialQueue);
  }

  return Response.json({ tutorials });
}

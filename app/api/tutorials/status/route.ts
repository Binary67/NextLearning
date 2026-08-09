import { after } from "next/server";

import { listStoredTutorials } from "@/lib/tutorial-storage";
import { hasActiveTutorials } from "@/lib/tutorial-status";
import { runTutorialQueue } from "@/lib/tutorial-queue";

export const runtime = "nodejs";

export async function GET() {
  const storedTutorials = await listStoredTutorials();
  const tutorials = storedTutorials.map(({ id, status }) => ({
    id,
    status,
  }));

  if (hasActiveTutorials(tutorials)) {
    after(runTutorialQueue);
  }

  return Response.json({ tutorials });
}

import "server-only";

import { cache } from "react";

import { listStoredTutorials } from "@/lib/document-storage";
import {
  listTutorials,
  toTutorialResponse,
} from "@/lib/tutorial";

export const readTutorialsForPage = cache(listTutorials);

export const readTutorialsForLayout = cache(async () => {
  const tutorials = await listStoredTutorials();

  return tutorials
    .map((tutorial) => toTutorialResponse(tutorial))
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
});

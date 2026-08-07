import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  readStoredGuidedProgress,
  readStoredLearningState,
  updateStoredGuidedProgress,
  updateStoredLearningState,
} from "@/lib/document-storage";

const createdTutorialIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdTutorialIds.splice(0).map((tutorialId) =>
      fs.rm(
        path.join(process.cwd(), "data", "tutorials", tutorialId),
        { force: true, recursive: true },
      ),
    ),
  );
});

describe("stored tutorial progress", () => {
  it("keeps guided and learning progress in one file", async () => {
    const tutorialId = randomUUID();
    createdTutorialIds.push(tutorialId);
    await fs.mkdir(
      path.join(process.cwd(), "data", "tutorials", tutorialId),
      { recursive: true },
    );

    await Promise.all([
      updateStoredGuidedProgress(tutorialId, () => ({
        cursor: "chunk:p1-introduction",
      })),
      updateStoredLearningState(tutorialId, () => ({
        mastery: 0.5,
      })),
    ]);

    await expect(readStoredGuidedProgress(tutorialId)).resolves.toEqual({
      cursor: "chunk:p1-introduction",
    });
    await expect(readStoredLearningState(tutorialId)).resolves.toEqual({
      mastery: 0.5,
    });

    const tutorialDirectory = path.join(
      process.cwd(),
      "data",
      "tutorials",
      tutorialId,
    );
    await expect(
      fs.readdir(tutorialDirectory),
    ).resolves.toEqual(["progress.json"]);
    await expect(
      fs.readFile(path.join(tutorialDirectory, "progress.json"), "utf8"),
    ).resolves.toSatisfy((value: string) => {
      expect(JSON.parse(value)).toEqual({
        guided: { cursor: "chunk:p1-introduction" },
        learning: { mastery: 0.5 },
      });
      return true;
    });
  });
});

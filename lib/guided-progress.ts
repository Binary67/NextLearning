import type { DocumentModel } from "@/lib/document-model";

export const GUIDED_PROGRESS_SCHEMA_VERSION = 1;

export type GuidedReadingCursor = {
  pageIndex: number;
  chunkId: string;
  state: "pending" | "in_progress";
};

export type GuidedReadingProgress = {
  schemaVersion: number;
  tutorialId: string;
  updatedAt: string;
  cursor: GuidedReadingCursor | null;
  completedChunkIds: string[];
};

export type GuidedProgressEvent =
  | {
      type: "segment_started";
      pageIndex: number;
      chunkId: string;
    }
  | {
      type: "segment_completed";
      pageIndex: number;
      chunkId: string;
    }
  | {
      type: "empty_page_completed";
      pageIndex: number;
    };

export function createEmptyGuidedProgress(
  tutorialId: string,
  now = new Date(),
): GuidedReadingProgress {
  return {
    schemaVersion: GUIDED_PROGRESS_SCHEMA_VERSION,
    tutorialId,
    updatedAt: now.toISOString(),
    cursor: null,
    completedChunkIds: [],
  };
}

export function updateGuidedProgress(
  progress: GuidedReadingProgress,
  event: GuidedProgressEvent,
  model: DocumentModel,
  now = new Date(),
): GuidedReadingProgress {
  const page = model.pages[event.pageIndex - 1];

  if (!page) {
    throw new Error("The guided-reading page is unavailable.");
  }

  if (event.type === "empty_page_completed") {
    if (page.chunks.length !== 0) {
      throw new Error("The guided-reading page is not empty.");
    }

    return {
      ...progress,
      updatedAt: now.toISOString(),
      cursor: findNextCursor(
        model,
        event.pageIndex + 1,
        0,
        new Set(progress.completedChunkIds),
      ),
    };
  }

  const chunkIndex = page.chunks.findIndex(
    (chunk) => chunk.id === event.chunkId,
  );

  if (chunkIndex < 0) {
    throw new Error("The guided page lesson is unavailable.");
  }

  if (event.type === "segment_started") {
    return {
      ...progress,
      updatedAt: now.toISOString(),
      cursor: {
        pageIndex: event.pageIndex,
        chunkId: event.chunkId,
        state: "in_progress",
      },
    };
  }

  const completedChunkIds = new Set(progress.completedChunkIds);
  completedChunkIds.add(event.chunkId);

  return {
    ...progress,
    updatedAt: now.toISOString(),
    cursor: findNextCursor(
      model,
      event.pageIndex,
      chunkIndex + 1,
      completedChunkIds,
    ),
    completedChunkIds: [...completedChunkIds],
  };
}

export function validateGuidedProgress(
  value: unknown,
  tutorialId: string,
  model: DocumentModel,
): GuidedReadingProgress {
  if (
    !isRecord(value) ||
    value.schemaVersion !== GUIDED_PROGRESS_SCHEMA_VERSION ||
    value.tutorialId !== tutorialId ||
    !isIsoTimestamp(value.updatedAt) ||
    !Array.isArray(value.completedChunkIds) ||
    !value.completedChunkIds.every(
      (chunkId) => typeof chunkId === "string",
    ) ||
    new Set(value.completedChunkIds).size !==
      value.completedChunkIds.length
  ) {
    throw new Error("The stored guided-reading progress is invalid.");
  }

  const chunkLocations = new Map(
    model.pages.flatMap((page) =>
      page.chunks.map(
        (chunk) =>
          [
            chunk.id,
            { pageIndex: page.page_index, chunkId: chunk.id },
          ] as const,
      ),
    ),
  );

  if (
    value.completedChunkIds.some(
      (chunkId) => !chunkLocations.has(chunkId),
    ) ||
    !isValidCursor(value.cursor, chunkLocations)
  ) {
    throw new Error(
      "The stored guided-reading progress references unavailable content.",
    );
  }

  const progress = value as GuidedReadingProgress;

  if (progress.cursor !== null || progress.completedChunkIds.length === 0) {
    return progress;
  }

  return {
    ...progress,
    cursor: findNextCursor(
      model,
      1,
      0,
      new Set(progress.completedChunkIds),
    ),
  };
}

export function summarizeGuidedProgress(
  model: DocumentModel,
  progress: GuidedReadingProgress,
) {
  const totalChunks = model.pages.reduce(
    (count, page) => count + page.chunks.length,
    0,
  );
  const completed = new Set(progress.completedChunkIds);
  const completedPages = model.pages.filter(
    (page) =>
      page.chunks.length > 0 &&
      page.chunks.every((chunk) => completed.has(chunk.id)),
  ).length;

  return {
    completedChunks: completed.size,
    totalChunks,
    completedPages,
    totalInstructionalPages: model.pages.filter(
      (page) => page.chunks.length > 0,
    ).length,
    percentage:
      totalChunks === 0
        ? 0
        : Math.round((completed.size / totalChunks) * 100),
  };
}

function findNextCursor(
  model: DocumentModel,
  startPageIndex: number,
  startChunkIndex: number,
  completedChunkIds: ReadonlySet<string>,
): GuidedReadingCursor | null {
  for (
    let pageIndex = startPageIndex;
    pageIndex <= model.page_count;
    pageIndex += 1
  ) {
    const page = model.pages[pageIndex - 1];
    const firstChunkIndex =
      pageIndex === startPageIndex ? startChunkIndex : 0;

    for (
      let chunkIndex = firstChunkIndex;
      chunkIndex < page.chunks.length;
      chunkIndex += 1
    ) {
      const chunk = page.chunks[chunkIndex];

      if (!completedChunkIds.has(chunk.id)) {
        return {
          pageIndex,
          chunkId: chunk.id,
          state: "pending",
        };
      }
    }
  }

  return null;
}

function isValidCursor(
  value: unknown,
  chunkLocations: ReadonlyMap<
    string,
    { pageIndex: number; chunkId: string }
  >,
) {
  if (value === null) {
    return true;
  }

  if (
    !isRecord(value) ||
    typeof value.pageIndex !== "number" ||
    !Number.isInteger(value.pageIndex) ||
    typeof value.chunkId !== "string" ||
    !["pending", "in_progress"].includes(String(value.state))
  ) {
    return false;
  }

  const location = chunkLocations.get(value.chunkId);
  return location?.pageIndex === value.pageIndex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIsoTimestamp(value: unknown) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

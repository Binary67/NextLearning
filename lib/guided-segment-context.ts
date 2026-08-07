import type {
  DocumentChunk,
  DocumentModel,
} from "@/lib/document-model";

export type GuidedSegmentContext = {
  previous_segments: GuidedSegmentContextItem[];
  upcoming_segments: GuidedSegmentContextItem[];
};

type GuidedSegmentContextItem = {
  page_index: number;
  page_label: string;
  section_title: string;
  title: string;
  summary: string;
};

const SURROUNDING_SEGMENT_LIMIT = 2;

export function getGuidedSegmentContext(
  model: DocumentModel,
  pageIndex: number,
  segmentIndex: number,
): GuidedSegmentContext {
  const activeChunk = model.pages[pageIndex - 1].chunks[segmentIndex];
  const segments = model.pages.flatMap((page) =>
    page.chunks.map((chunk) => ({
      page_index: page.page_index,
      page_label: page.page_label,
      chunk,
    })),
  );
  const activeIndex = segments.findIndex(
    (segment) => segment.chunk.id === activeChunk.id,
  );

  return {
    previous_segments: segments
      .slice(
        Math.max(0, activeIndex - SURROUNDING_SEGMENT_LIMIT),
        activeIndex,
      )
      .map(toContextItem),
    upcoming_segments: segments
      .slice(
        activeIndex + 1,
        activeIndex + 1 + SURROUNDING_SEGMENT_LIMIT,
      )
      .map(toContextItem),
  };
}

export function formatGuidedSegmentContext(
  context: GuidedSegmentContext,
) {
  return `Previous page lessons:
${formatContextItems(context.previous_segments)}

Upcoming page lessons:
${formatContextItems(context.upcoming_segments)}`;
}

function toContextItem(segment: {
  page_index: number;
  page_label: string;
  chunk: DocumentChunk;
}): GuidedSegmentContextItem {
  return {
    page_index: segment.page_index,
    page_label: segment.page_label,
    section_title: segment.chunk.section_title,
    title: segment.chunk.title,
    summary: segment.chunk.summary,
  };
}

function formatContextItems(items: GuidedSegmentContextItem[]) {
  if (items.length === 0) {
    return "(None.)";
  }

  return items
    .map(
      (item) =>
        `- PDF page ${item.page_index} (${JSON.stringify(item.page_label)}), section ${JSON.stringify(item.section_title)}, teaching focus ${JSON.stringify(item.title)}: ${JSON.stringify(item.summary)}`,
    )
    .join("\n");
}

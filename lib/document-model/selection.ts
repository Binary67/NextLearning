import {
  getDocumentChunkSourceText,
  getDocumentChunksForSourcePage,
  type DocumentChunk,
  type DocumentChunkSummary,
  type DocumentConcept,
  type DocumentMapSummary,
  type DocumentModel,
  type OccurrenceRole,
  type SelectionGrounding,
  type SelectionRelatedPage,
  type TextSelectionContext,
} from "@/lib/document-model/types";

type ChunkTokens = {
  title: Set<string>;
  concepts: Set<string>;
  source: Set<string>;
  summary: Set<string>;
};

type RelatedPageCandidate = DocumentChunk & {
  page_index: number;
  page_label: string;
  connection_confidence: number;
  occurrence_priority: number;
  shared_concept_count: number;
  text_similarity: number;
};

type RelatedConnection = {
  concept_id: string;
  confidence: number;
  relevant_pages: number[];
};

const STOP_WORDS = new Set([
  "all",
  "also",
  "and",
  "are",
  "both",
  "can",
  "each",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "over",
  "that",
  "the",
  "this",
  "was",
  "were",
  "where",
  "with",
]);
const MINIMUM_RELATED_OCCURRENCE_PRIORITY = 2;
const RELATED_PAGE_LIMIT = 3;
const OCCURRENCE_PRIORITIES: Record<OccurrenceRole, number> = {
  referenced: 0,
  assessed: 1,
  introduced: 2,
  applied: 3,
  illustrated: 3,
  defined: 4,
  explained: 4,
};

export function summarizeDocumentModel(
  model: DocumentModel,
): DocumentMapSummary {
  return {
    page_count: model.page_count,
    concept_count: model.concepts.length,
    connection_count: model.connections.length,
  };
}

export function buildTextSelectionContext(
  model: DocumentModel,
  pageIndex: number,
  selectedChunk: DocumentChunk,
  selectionText: string,
): TextSelectionContext | null {
  if (
    !getDocumentChunksForSourcePage(model, pageIndex).some(
      (chunk) => chunk.id === selectedChunk.id,
    )
  ) {
    return null;
  }

  const conceptNamesById = new Map(
    model.concepts.map((concept) => [concept.id, concept.name]),
  );
  const selectionTokens = tokenize(selectionText);

  return {
    selected_chunk: toChunkSummary(selectedChunk),
    related_pages: findRelatedPages(
      model,
      pageIndex,
      selectedChunk,
      selectionTokens,
      conceptNamesById,
    ),
  };
}

export function buildSelectionGrounding(
  model: DocumentModel,
  pageIndex: number,
  textSelection: TextSelectionContext | null,
): SelectionGrounding {
  const page = model.pages[pageIndex - 1];
  const currentOccurrences = getPageConceptOccurrences(model, pageIndex);
  const currentConceptIds = new Set(
    currentOccurrences.map(({ concept }) => concept.id),
  );
  const connections = model.connections
    .filter(
      (connection) =>
        currentConceptIds.has(connection.from) ||
        currentConceptIds.has(connection.to),
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 12);
  const relatedConceptIds = new Set(
    connections.flatMap((connection) => [connection.from, connection.to]),
  );
  const relatedPageIndexes = new Set(
    connections.flatMap((connection) => connection.relevant_pages),
  );
  relatedPageIndexes.delete(pageIndex);

  const relatedChunks = model.pages
    .filter((relatedPage) =>
      relatedPageIndexes.has(relatedPage.page_index),
    )
    .flatMap((relatedPage) =>
      relatedPage.chunks
        .filter((chunk) =>
          chunk.concept_ids.some((conceptId) =>
            relatedConceptIds.has(conceptId),
          ),
        )
        .map((chunk) => ({
          ...toChunkSummary(chunk),
          page_index: relatedPage.page_index,
          page_label: relatedPage.page_label,
        })),
    )
    .slice(0, 8);
  const conceptNamesById = new Map(
    model.concepts.map((concept) => [concept.id, concept.name]),
  );

  return {
    current_page: {
      page_index: pageIndex,
      page_label: page?.page_label ?? String(pageIndex),
    },
    current_chunks: page?.chunks.map(toChunkSummary) ?? [],
    current_concepts: currentOccurrences.map(({ concept, occurrence }) => ({
      id: concept.id,
      name: concept.name,
      definition: concept.definition,
      role: occurrence.role,
    })),
    connections: connections.map((connection) => ({
      from: conceptNamesById.get(connection.from) ?? connection.from,
      to: conceptNamesById.get(connection.to) ?? connection.to,
      relationship: connection.relationship,
      relevant_pages: connection.relevant_pages,
      reason: connection.reason,
    })),
    related_chunks: relatedChunks,
    text_selection: textSelection,
  };
}

function findRelatedPages(
  model: DocumentModel,
  currentPageIndex: number,
  selectedChunk: DocumentChunk,
  selectionTokens: ReadonlySet<string>,
  conceptNamesById: ReadonlyMap<string, string>,
): SelectionRelatedPage[] {
  const selectedConceptIds = new Set(selectedChunk.concept_ids);
  const conceptsById = new Map(
    model.concepts.map((concept) => [concept.id, concept]),
  );
  const relatedConnections: RelatedConnection[] = model.connections.flatMap(
    (connection) => {
      if (selectedConceptIds.has(connection.from)) {
        return [
          {
            concept_id: connection.to,
            confidence: connection.confidence,
            relevant_pages: connection.relevant_pages,
          },
        ];
      }

      if (selectedConceptIds.has(connection.to)) {
        return [
          {
            concept_id: connection.from,
            confidence: connection.confidence,
            relevant_pages: connection.relevant_pages,
          },
        ];
      }

      return [];
    },
  );
  const candidates: RelatedPageCandidate[] = [];

  for (const page of model.pages) {
    if (page.page_index === currentPageIndex) {
      continue;
    }

    for (const chunk of page.chunks) {
      if (chunk.id === selectedChunk.id) {
        continue;
      }

      const sharedConceptIds = chunk.concept_ids.filter((conceptId) =>
        selectedConceptIds.has(conceptId),
      );
      const candidateConnections = relatedConnections.filter(
        (connection) =>
          connection.relevant_pages.includes(page.page_index) &&
          chunk.concept_ids.includes(connection.concept_id),
      );

      if (
        sharedConceptIds.length === 0 &&
        candidateConnections.length === 0
      ) {
        continue;
      }

      const occurrenceConceptIds =
        sharedConceptIds.length > 0
          ? sharedConceptIds
          : candidateConnections.map(
              (connection) => connection.concept_id,
            );
      const occurrencePriority = getOccurrencePriority(
        occurrenceConceptIds,
        page.page_index,
        conceptsById,
      );

      if (occurrencePriority < MINIMUM_RELATED_OCCURRENCE_PRIORITY) {
        continue;
      }

      const chunkTokens = getChunkTokens(chunk, conceptNamesById);
      const textSimilarity =
        selectionTokens.size === 0
          ? 0
          : countTokenMatches(
              selectionTokens,
              combineChunkTokens(chunkTokens),
            ) / selectionTokens.size;

      candidates.push({
        ...chunk,
        page_index: page.page_index,
        page_label: page.page_label,
        connection_confidence: Math.max(
          0,
          ...candidateConnections.map(
            (connection) => connection.confidence,
          ),
        ),
        occurrence_priority: occurrencePriority,
        shared_concept_count: sharedConceptIds.length,
        text_similarity: textSimilarity,
      });
    }
  }

  candidates.sort(compareRelatedPageCandidates);
  const relatedPages: SelectionRelatedPage[] = [];
  const seenPageIndexes = new Set<number>();

  for (const candidate of candidates) {
    if (seenPageIndexes.has(candidate.page_index)) {
      continue;
    }

    seenPageIndexes.add(candidate.page_index);
    relatedPages.push({
      ...toChunkSummary(candidate),
      page_index: candidate.page_index,
      page_label: candidate.page_label,
    });

    if (relatedPages.length === RELATED_PAGE_LIMIT) {
      break;
    }
  }

  return relatedPages;
}

function toChunkSummary(chunk: DocumentChunk): DocumentChunkSummary {
  return {
    id: chunk.id,
    section_title: chunk.section_title,
    title: chunk.title,
    summary: chunk.summary,
    concept_ids: chunk.concept_ids,
  };
}

function getOccurrencePriority(
  conceptIds: string[],
  pageIndex: number,
  conceptsById: ReadonlyMap<string, DocumentConcept>,
) {
  let priority = 0;

  for (const conceptId of conceptIds) {
    const occurrence = conceptsById
      .get(conceptId)
      ?.occurrences.find((item) => item.page_index === pageIndex);

    if (occurrence) {
      priority = Math.max(
        priority,
        OCCURRENCE_PRIORITIES[occurrence.role],
      );
    }
  }

  return priority;
}

function compareRelatedPageCandidates(
  left: RelatedPageCandidate,
  right: RelatedPageCandidate,
) {
  return (
    right.shared_concept_count - left.shared_concept_count ||
    right.text_similarity - left.text_similarity ||
    right.connection_confidence - left.connection_confidence ||
    right.occurrence_priority - left.occurrence_priority ||
    left.page_index - right.page_index ||
    left.id.localeCompare(right.id)
  );
}

function getChunkTokens(
  chunk: DocumentChunk,
  conceptNamesById: ReadonlyMap<string, string>,
): ChunkTokens {
  return {
    title: tokenize(chunk.title),
    concepts: tokenize(
      chunk.concept_ids
        .map((conceptId) => conceptNamesById.get(conceptId) ?? "")
        .join(" "),
    ),
    source: tokenize(getDocumentChunkSourceText(chunk)),
    summary: tokenize(chunk.summary),
  };
}

function combineChunkTokens(chunkTokens: ChunkTokens) {
  return new Set([
    ...chunkTokens.title,
    ...chunkTokens.concepts,
    ...chunkTokens.source,
    ...chunkTokens.summary,
  ]);
}

function countTokenMatches(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
) {
  let matches = 0;

  for (const token of left) {
    if (right.has(token)) {
      matches += 1;
    }
  }

  return matches;
}

function tokenize(value: string) {
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  return new Set(
    words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function getPageConceptOccurrences(
  model: DocumentModel,
  pageIndex: number,
) {
  return model.concepts.flatMap((concept) =>
    concept.occurrences
      .filter((occurrence) => occurrence.page_index === pageIndex)
      .map((occurrence) => ({ concept, occurrence })),
  );
}

import {
  buildTextSelectionContext,
  type DocumentChunk,
  type DocumentModel,
  type DocumentPage,
  type TextSelectionContext,
} from "@/lib/document-model";
import {
  buildChunkSearchText,
  getConceptNames,
} from "@/lib/document-embedding-generation";
import { requestEmbeddings } from "@/lib/document-embedding-client";
import type {
  DocumentEmbeddings,
  DocumentSearchIndex,
  DocumentTopicMatch,
  RankedChunk,
  ScoredTopicChunk,
} from "@/lib/document-embedding-types";

const EMBEDDING_WEIGHT = 0.7;
const BM25_WEIGHT = 0.3;
const BM25_K1 = 1.2;
const BM25_LENGTH_NORMALIZATION = 0.75;
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

const documentSearchIndexes = new WeakMap<
  DocumentModel,
  DocumentSearchIndex
>();
const embeddingIndexes = new WeakMap<
  DocumentEmbeddings,
  ReadonlyMap<string, number[]>
>();

export async function findTextSelectionContext(
  model: DocumentModel,
  documentEmbeddings: DocumentEmbeddings,
  pageIndex: number,
  selectionText: string,
  signal?: AbortSignal,
): Promise<TextSelectionContext | null> {
  const searchIndex = getDocumentSearchIndex(model);
  const pageChunks = searchIndex.chunksBySourcePage.get(pageIndex) ?? [];

  if (pageChunks.length === 0) {
    return null;
  }

  const { deployment, embeddings } = await requestEmbeddings(
    [selectionText],
    signal,
  );

  if (deployment !== documentEmbeddings.deployment) {
    throw new Error(
      "The tutorial embeddings use a different Azure OpenAI deployment.",
    );
  }

  const queryEmbedding = embeddings[0];

  if (queryEmbedding.length !== documentEmbeddings.dimensions) {
    throw new Error(
      "The tutorial embeddings use a different vector size.",
    );
  }

  const embeddingsByChunkId = getEmbeddingsByChunkId(documentEmbeddings);
  const { scores: bm25Scores, highestScore: highestBm25Score } =
    scoreChunksWithBm25(selectionText, searchIndex, pageChunks);
  const rankedChunks: RankedChunk[] = pageChunks.map((chunk) => ({
    chunk,
    embeddingSimilarity: dotProduct(
      queryEmbedding,
      embeddingsByChunkId.get(chunk.id) ?? [],
    ),
    bm25Score: bm25Scores.get(chunk.id) ?? 0,
  }));

  rankedChunks.sort((left, right) => {
    const leftScore = combinedScore(left, highestBm25Score);
    const rightScore = combinedScore(right, highestBm25Score);

    return (
      rightScore - leftScore ||
      left.chunk.id.localeCompare(right.chunk.id)
    );
  });

  return buildTextSelectionContext(
    model,
    pageIndex,
    rankedChunks[0].chunk,
    selectionText,
  );
}

export async function findHybridDocumentTopics(
  model: DocumentModel,
  documentEmbeddings: DocumentEmbeddings,
  query: string,
  signal?: AbortSignal,
): Promise<DocumentTopicMatch[]> {
  const searchIndex = getDocumentSearchIndex(model);
  const { deployment, embeddings } = await requestEmbeddings(
    [query],
    signal,
  );

  if (
    deployment !== documentEmbeddings.deployment ||
    embeddings[0].length !== documentEmbeddings.dimensions
  ) {
    throw new Error(
      "The tutorial embeddings use a different Azure OpenAI deployment.",
    );
  }

  const queryEmbedding = embeddings[0];
  const embeddingsByChunkId = getEmbeddingsByChunkId(documentEmbeddings);
  const { scores: bm25Scores, highestScore: highestBm25Score } =
    scoreChunksWithBm25(query, searchIndex, searchIndex.chunks);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const bestChunkByPage = new Map<number, ScoredTopicChunk>();

  for (const chunk of searchIndex.chunks) {
    const embedding = embeddingsByChunkId.get(chunk.id);
    const embeddingSimilarity = embedding
      ? dotProduct(queryEmbedding, embedding)
      : 0;
    const lexicalScore =
      highestBm25Score === 0
        ? 0
        : (bm25Scores.get(chunk.id) ?? 0) / highestBm25Score;
    const exactMatchBoost =
      normalizedQuery &&
      [chunk.section_title, chunk.title].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      )
        ? 0.15
        : 0;
    const page = searchIndex.pageByChunkId.get(chunk.id);

    if (!page) {
      continue;
    }

    const candidate = {
      chunk,
      score:
        EMBEDDING_WEIGHT * embeddingSimilarity +
        BM25_WEIGHT * lexicalScore +
        exactMatchBoost,
    };
    const currentBest = bestChunkByPage.get(page.page_index);

    if (!currentBest || compareScoredTopicChunks(candidate, currentBest) < 0) {
      bestChunkByPage.set(page.page_index, candidate);
    }
  }

  const topChunks: ScoredTopicChunk[] = [];

  for (const candidate of bestChunkByPage.values()) {
    const insertionIndex = topChunks.findIndex(
      (current) => compareScoredTopicChunks(candidate, current) < 0,
    );

    if (insertionIndex === -1) {
      if (topChunks.length < 5) {
        topChunks.push(candidate);
      }
      continue;
    }

    topChunks.splice(insertionIndex, 0, candidate);

    if (topChunks.length > 5) {
      topChunks.pop();
    }
  }

  return topChunks.map(({ chunk }) => {
    const page = searchIndex.pageByChunkId.get(chunk.id)!;

    return {
      page_index: page.page_index,
      page_label: page.page_label,
      title: chunk.title,
      summary: chunk.summary,
      concepts: chunk.concept_ids.flatMap((conceptId) => {
        const name = searchIndex.conceptNames.get(conceptId);
        return name ? [name] : [];
      }),
    };
  });
}

function scoreChunksWithBm25(
  query: string,
  searchIndex: DocumentSearchIndex,
  candidates: DocumentChunk[],
) {
  const queryTokens = new Set(tokenize(query));
  const scores = new Map<string, number>();
  let highestScore = 0;

  for (const chunk of candidates) {
    const searchData = searchIndex.searchDataByChunkId.get(chunk.id);
    let score = 0;

    if (searchData) {
      for (const token of queryTokens) {
        const termFrequency = searchData.termCounts.get(token) ?? 0;

        if (termFrequency === 0) {
          continue;
        }

        const frequency = searchIndex.documentFrequency.get(token) ?? 0;
        const inverseDocumentFrequency = Math.log(
          1 +
            (searchIndex.chunks.length - frequency + 0.5) /
              (frequency + 0.5),
        );
        const lengthNormalization =
          searchIndex.averageDocumentLength === 0
            ? 1
            : 1 -
              BM25_LENGTH_NORMALIZATION +
              BM25_LENGTH_NORMALIZATION *
                (searchData.length / searchIndex.averageDocumentLength);

        score +=
          inverseDocumentFrequency *
          ((termFrequency * (BM25_K1 + 1)) /
            (termFrequency + BM25_K1 * lengthNormalization));
      }
    }

    scores.set(chunk.id, score);
    highestScore = Math.max(highestScore, score);
  }

  return { scores, highestScore };
}

function getDocumentSearchIndex(model: DocumentModel) {
  const cached = documentSearchIndexes.get(model);

  if (cached) {
    return cached;
  }

  const conceptNames = getConceptNames(model);
  const chunks: DocumentChunk[] = [];
  const pageByChunkId = new Map<string, DocumentPage>();
  const chunksBySourcePage = new Map<number, DocumentChunk[]>();
  const searchDataByChunkId = new Map<
    string,
    {
      length: number;
      termCounts: ReadonlyMap<string, number>;
    }
  >();
  const documentFrequency = new Map<string, number>();
  let totalDocumentLength = 0;

  for (const page of model.pages) {
    for (const chunk of page.chunks) {
      chunks.push(chunk);
      pageByChunkId.set(chunk.id, page);

      for (const pageIndex of new Set(
        chunk.sources.map((source) => source.page_index),
      )) {
        const sourcePageChunks = chunksBySourcePage.get(pageIndex) ?? [];
        sourcePageChunks.push(chunk);
        chunksBySourcePage.set(pageIndex, sourcePageChunks);
      }

      const tokens = tokenize(buildChunkSearchText(chunk, conceptNames));
      const termCounts = countTerms(tokens);
      searchDataByChunkId.set(chunk.id, {
        length: tokens.length,
        termCounts,
      });
      totalDocumentLength += tokens.length;

      for (const token of termCounts.keys()) {
        documentFrequency.set(
          token,
          (documentFrequency.get(token) ?? 0) + 1,
        );
      }
    }
  }

  const searchIndex: DocumentSearchIndex = {
    chunks,
    conceptNames,
    pageByChunkId,
    chunksBySourcePage,
    searchDataByChunkId,
    documentFrequency,
    averageDocumentLength:
      chunks.length === 0 ? 0 : totalDocumentLength / chunks.length,
  };
  documentSearchIndexes.set(model, searchIndex);
  return searchIndex;
}

function getEmbeddingsByChunkId(documentEmbeddings: DocumentEmbeddings) {
  const cached = embeddingIndexes.get(documentEmbeddings);

  if (cached) {
    return cached;
  }

  const index = new Map(
    documentEmbeddings.chunks.map(({ chunk_id, embedding }) => [
      chunk_id,
      embedding,
    ]),
  );
  embeddingIndexes.set(documentEmbeddings, index);
  return index;
}

function compareScoredTopicChunks(
  left: ScoredTopicChunk,
  right: ScoredTopicChunk,
) {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return left.chunk.id.localeCompare(right.chunk.id);
}

function combinedScore(
  rankedChunk: RankedChunk,
  highestBm25Score: number,
) {
  const normalizedBm25Score =
    highestBm25Score === 0
      ? 0
      : rankedChunk.bm25Score / highestBm25Score;

  return (
    EMBEDDING_WEIGHT * rankedChunk.embeddingSimilarity +
    BM25_WEIGHT * normalizedBm25Score
  );
}

function dotProduct(left: number[], right: number[]) {
  if (left.length !== right.length) {
    throw new Error("The document embedding vector size is invalid.");
  }

  return left.reduce(
    (score, number, index) => score + number * right[index],
    0,
  );
}

function tokenize(value: string) {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => word.length > 2 && !STOP_WORDS.has(word),
  );
}

function countTerms(tokens: string[]) {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

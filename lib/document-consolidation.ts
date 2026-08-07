import { createHash } from "node:crypto";

import {
  buildDocumentTopicIndex,
  DOCUMENT_STORAGE_SCHEMA_VERSION,
  type DocumentBatch,
  type DocumentMap,
  type GeneratedDocumentBatch,
} from "@/lib/document-batches";
import { addDocumentHighlightBounds } from "@/lib/document-highlights";
import {
  type DocumentConcept,
  type DocumentConnection,
  type GeneratedDocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";

export async function consolidateDocumentBatches(
  fileData: Buffer,
  documentId: string,
  pageCount: number,
  generatedBatches: GeneratedDocumentBatch[],
) {
  const orderedBatches = [...generatedBatches].sort(
    (left, right) => left.batch_index - right.batch_index,
  );
  const canonicalConcepts = new Map<string, DocumentConcept>();
  const conceptIdsByBatch = new Map<number, Map<string, string>>();
  const usedConceptIds = new Map<string, string>();

  for (const batch of orderedBatches) {
    const conceptIds = new Map<string, string>();

    for (const concept of batch.concepts) {
      const key = normalizeConceptName(concept.name);
      const existing = canonicalConcepts.get(key);
      const canonicalId =
        existing?.id ??
        createCanonicalConceptId(concept.name, key, usedConceptIds);
      conceptIds.set(concept.id, canonicalId);

      if (existing) {
        existing.occurrences = mergeOccurrences(
          existing.occurrences,
          concept.occurrences,
        );
      } else {
        canonicalConcepts.set(key, {
          ...concept,
          id: canonicalId,
          occurrences: [...concept.occurrences],
        });
      }
    }

    conceptIdsByBatch.set(batch.batch_index, conceptIds);
  }

  const pages = orderedBatches.flatMap((batch) => {
    const conceptIds = conceptIdsByBatch.get(batch.batch_index)!;
    return batch.pages.map((page) => ({
      ...page,
      chunks: page.chunks.map((chunk) => ({
        ...chunk,
        concept_ids: chunk.concept_ids.map(
          (conceptId) => conceptIds.get(conceptId)!,
        ),
      })),
    }));
  });
  const connections = mergeConnections(
    orderedBatches.flatMap((batch) => {
      const conceptIds = conceptIdsByBatch.get(batch.batch_index)!;
      return batch.connections.flatMap((connection) => {
        const from = conceptIds.get(connection.from);
        const to = conceptIds.get(connection.to);

        return from && to && from !== to
          ? [{ ...connection, from, to }]
          : [];
      });
    }),
  );
  const generatedModel: GeneratedDocumentModel = {
    schema_version: orderedBatches[0].schema_version,
    document_id: documentId,
    title: orderedBatches[0].title,
    page_count: pageCount,
    pages,
    concepts: [...canonicalConcepts.values()],
    connections,
  };
  const model = validateDocumentModel(
    await addDocumentHighlightBounds(fileData, generatedModel),
    documentId,
  );
  const batchRanges = orderedBatches.map(
    ({ batch_index, start_page, end_page }) => ({
      batch_index,
      start_page,
      end_page,
    }),
  );
  const map: DocumentMap = {
    storage_schema_version: DOCUMENT_STORAGE_SCHEMA_VERSION,
    schema_version: model.schema_version,
    document_id: model.document_id,
    title: model.title,
    page_count: model.page_count,
    chunk_count: model.pages.reduce(
      (count, page) => count + page.chunks.length,
      0,
    ),
    batches: batchRanges,
    concepts: model.concepts,
    connections: model.connections,
  };
  const batches: DocumentBatch[] = batchRanges.map((range) => ({
    schema_version: DOCUMENT_STORAGE_SCHEMA_VERSION,
    document_id: documentId,
    ...range,
    summary: orderedBatches[range.batch_index - 1].summary,
    pages: model.pages.slice(range.start_page - 1, range.end_page),
  }));

  return {
    map,
    batches,
    topicIndex: buildDocumentTopicIndex(map, batches),
  };
}

function normalizeConceptName(name: string) {
  return name.normalize("NFKC").trim().toLocaleLowerCase();
}

function createCanonicalConceptId(
  name: string,
  key: string,
  usedIds: Map<string, string>,
) {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/^-+|-+$/g, "") || "topic";
  let id = `concept:${slug}`;
  const existingKey = usedIds.get(id);

  if (existingKey && existingKey !== key) {
    id = `${id}-${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
  }

  usedIds.set(id, key);
  return id;
}

function mergeOccurrences(
  left: DocumentConcept["occurrences"],
  right: DocumentConcept["occurrences"],
) {
  const byPage = new Map(
    left.map((occurrence) => [occurrence.page_index, occurrence]),
  );

  for (const occurrence of right) {
    const existing = byPage.get(occurrence.page_index);

    if (!existing || occurrence.confidence > existing.confidence) {
      byPage.set(occurrence.page_index, occurrence);
    }
  }

  return [...byPage.values()].sort(
    (first, second) => first.page_index - second.page_index,
  );
}

function mergeConnections(connections: DocumentConnection[]) {
  const merged = new Map<string, DocumentConnection>();

  for (const connection of connections) {
    const key = [
      connection.from,
      connection.to,
      connection.relationship,
    ].join("\0");
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...connection,
        relevant_pages: [...new Set(connection.relevant_pages)].sort(
          (left, right) => left - right,
        ),
      });
      continue;
    }

    existing.relevant_pages = [
      ...new Set([...existing.relevant_pages, ...connection.relevant_pages]),
    ].sort((left, right) => left - right);
    existing.confidence = Math.max(
      existing.confidence,
      connection.confidence,
    );
  }

  return [...merged.values()];
}

import type { DocumentEmbeddings } from "@/lib/document-embedding-types";
import type { DocumentModel } from "@/lib/document-model";

export const model: DocumentModel = {
  schema_version: 5,
  document_id: "document-id",
  title: "Document",
  page_count: 1,
  pages: [
    {
      page_index: 1,
      page_label: "1",
      chunks: [
        {
          id: "chunk:first",
          section_title: "Section",
          sources: [
            {
              page_index: 1,
              source_text: "Source text",
              highlight_bounds: [
                { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
              ],
            },
          ],
          title: "First",
          summary: "Summary",
          concept_ids: [],
        },
      ],
    },
  ],
  concepts: [],
  connections: [],
};

export const documentEmbeddings: DocumentEmbeddings = {
  schema_version: 1,
  document_id: "document-id",
  deployment: "embeddings",
  dimensions: 2,
  chunks: [{ chunk_id: "chunk:first", embedding: [1, 0] }],
};

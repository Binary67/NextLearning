import { describe, expect, it } from "vitest";

import {
  type GeneratedDocumentModel,
  validateGeneratedDocumentModel,
} from "@/lib/document-model";

describe("validateGeneratedDocumentModel", () => {
  it("accepts a continued paragraph owned by the later page", () => {
    const model = createContinuationModel();

    expect(
      validateGeneratedDocumentModel(model, model.document_id),
    ).toEqual(model);
  });

  it("accepts multiple ordered source spans from the same page", () => {
    const model = createContinuationModel();
    model.pages[1].chunks[0].sources.push(
      {
        page_index: 2,
        source_text: "A separate figure caption supports the lesson.",
      },
      {
        page_index: 2,
        source_text: "A later equation completes the explanation.",
      },
    );

    expect(
      validateGeneratedDocumentModel(model, model.document_id),
    ).toEqual(model);
  });

  it("requires continued sources to be previous-page then owning-page", () => {
    const model = createContinuationModel();
    model.pages[1].chunks[0].sources.reverse();

    expect(() =>
      validateGeneratedDocumentModel(model, model.document_id),
    ).toThrow(
      'invalid page chunk on page 2 ("chunk:p2-introduction"): all previous-page sources must come before owning-page sources',
    );
  });

  it("rejects future and non-adjacent source pages", () => {
    const model = createContinuationModel();
    model.pages[1].chunks[0].sources[0].page_index = 3;

    expect(() =>
      validateGeneratedDocumentModel(model, model.document_id),
    ).toThrow(
      'invalid page chunk on page 2 ("chunk:p2-introduction"): source 1 must belong to page 2 or its immediately previous page',
    );
  });

  it("reports the exact chunk field that failed validation", () => {
    const model = createContinuationModel();
    model.pages[1].chunks[0].concept_ids = [];

    expect(() =>
      validateGeneratedDocumentModel(model, model.document_id),
    ).toThrow(
      'invalid page chunk on page 2 ("chunk:p2-introduction"): concept_ids must contain 1 to 12 unique concept IDs',
    );
  });

  it("limits a page to three coherent lessons", () => {
    const model = createContinuationModel();
    const chunk = model.pages[1].chunks[0];
    model.pages[1].chunks = Array.from({ length: 4 }, (_, index) => ({
      ...structuredClone(chunk),
      id: `chunk:p2-lesson-${index + 1}`,
    }));

    expect(() =>
      validateGeneratedDocumentModel(model, model.document_id),
    ).toThrow("invalid page");
  });
});

function createContinuationModel(): GeneratedDocumentModel {
  return {
    schema_version: 5,
    document_id: "document-id",
    title: "Document",
    page_count: 2,
    pages: [
      {
        page_index: 1,
        page_label: "1",
        chunks: [],
      },
      {
        page_index: 2,
        page_label: "2",
        chunks: [
          {
            id: "chunk:p2-introduction",
            section_title: "Introduction",
            sources: [
              {
                page_index: 1,
                source_text: "The paragraph begins on page one",
              },
              {
                page_index: 2,
                source_text: "and concludes on page two.",
              },
            ],
            title: "Introduction",
            summary: "The complete introductory idea.",
            concept_ids: ["concept:introduction"],
          },
        ],
      },
    ],
    concepts: [
      {
        id: "concept:introduction",
        name: "Introduction",
        definition: "The document's opening idea.",
        occurrences: [
          {
            page_index: 2,
            page_label: "2",
            role: "explained",
            explicitness: "explicit",
            confidence: 1,
          },
        ],
      },
    ],
    connections: [],
  };
}

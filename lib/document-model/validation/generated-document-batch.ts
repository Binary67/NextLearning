import type { GeneratedDocumentBatch } from "@/lib/document-batches";
import type { GeneratedDocumentModel } from "@/lib/document-model/types";
import {
  isNonEmptyString,
  isPositiveInteger,
  isRecord,
} from "@/lib/document-model/validation/guards";
import { validateDocumentModelValue } from "@/lib/document-model/validation/document-model";

export type GeneratedDocumentBatchValidationContext = {
  documentId: string;
  sourcePageCount: number;
  batchIndex: number;
  startPage: number;
  endPage: number;
};

export function validateGeneratedDocumentBatch(
  value: unknown,
  context: GeneratedDocumentBatchValidationContext,
): GeneratedDocumentBatch {
  if (
    !isPositiveInteger(context.batchIndex) ||
    !isPositiveInteger(context.sourcePageCount) ||
    !isPositiveInteger(context.startPage) ||
    !isPositiveInteger(context.endPage) ||
    context.startPage > context.endPage ||
    context.endPage > context.sourcePageCount ||
    !isNonEmptyString(context.documentId)
  ) {
    throw new Error("The generated document batch context is invalid.");
  }

  if (
    isRecord(value) &&
    ("batch_index" in value ||
      "start_page" in value ||
      "end_page" in value) &&
    (value.batch_index !== context.batchIndex ||
      value.start_page !== context.startPage ||
      value.end_page !== context.endPage)
  ) {
    throw new Error("The generated document batch has invalid identity.");
  }

  const model = validateDocumentModelValue(
    value,
    context.documentId,
    false,
    {
      startPage: context.startPage,
      endPage: context.endPage,
      pageCount: context.sourcePageCount,
    },
  ) as GeneratedDocumentModel;

  return {
    schema_version: model.schema_version,
    document_id: context.documentId,
    batch_index: context.batchIndex,
    start_page: context.startPage,
    end_page: context.endPage,
    title: model.title,
    page_count: context.sourcePageCount,
    pages: model.pages,
    concepts: model.concepts,
    connections: model.connections,
  };
}

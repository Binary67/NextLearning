export const DOCUMENT_LAYOUT_SCHEMA_VERSION = 1;

export type DocumentLayoutBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentLayoutBlock = {
  id: string;
  text: string;
  bounds: DocumentLayoutBounds;
};

export type DocumentLayoutPage = {
  page_index: number;
  width: number;
  height: number;
  blocks: DocumentLayoutBlock[];
};

export type DocumentLayout = {
  schema_version: number;
  document_id: string;
  pages: DocumentLayoutPage[];
};

export function validateDocumentLayout(
  value: unknown,
  documentId: string,
  pageCount: number,
): DocumentLayout {
  if (
    !isRecord(value) ||
    value.schema_version !== DOCUMENT_LAYOUT_SCHEMA_VERSION ||
    value.document_id !== documentId ||
    !Array.isArray(value.pages) ||
    value.pages.length !== pageCount
  ) {
    throw new Error("The document layout has invalid metadata.");
  }

  const blockIds = new Set<string>();

  for (const [pageOffset, page] of value.pages.entries()) {
    const pageIndex = pageOffset + 1;

    if (
      !isRecord(page) ||
      page.page_index !== pageIndex ||
      !isPositiveNumber(page.width) ||
      !isPositiveNumber(page.height) ||
      !Array.isArray(page.blocks)
    ) {
      throw new Error("The document layout has an invalid page.");
    }

    const pageBlockPrefix = `page:${String(pageIndex).padStart(4, "0")}:block:`;

    for (const block of page.blocks) {
      if (
        !isRecord(block) ||
        typeof block.id !== "string" ||
        !block.id.startsWith(pageBlockPrefix) ||
        blockIds.has(block.id) ||
        !isNonEmptyString(block.text) ||
        !isValidBounds(block.bounds)
      ) {
        throw new Error("The document layout has an invalid block.");
      }

      blockIds.add(block.id);
    }
  }

  return value as DocumentLayout;
}

function isValidBounds(value: unknown): value is DocumentLayoutBounds {
  if (
    !isRecord(value) ||
    !isNormalizedNumber(value.x) ||
    !isNormalizedNumber(value.y) ||
    !isPositiveNormalizedNumber(value.width) ||
    !isPositiveNormalizedNumber(value.height)
  ) {
    return false;
  }

  return value.x + value.width <= 1.000001 &&
    value.y + value.height <= 1.000001;
}

function isNormalizedNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isPositiveNormalizedNumber(value: unknown): value is number {
  return isNormalizedNumber(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value > 0
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

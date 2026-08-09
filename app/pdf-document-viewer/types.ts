import type {
  DocumentSelection,
  SelectionBounds,
} from "@/lib/document-selection";

export type PdfDocumentViewerProps = {
  documentId: string;
  documentUrl: string;
  documentName: string;
  pageIndex: number;
  selection: DocumentSelection | null;
  tutorHighlightBounds: SelectionBounds[];
  onSelectionChange: (selection: DocumentSelection | null) => void;
};

export type PageSize = {
  width: number;
  height: number;
};

export type PagePoint = {
  x: number;
  y: number;
};

import { ScanText } from "lucide-react";

import type {
  DocumentModel,
  TextSelectionContext,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";

import type { RelatedPagesStatus } from "./use-related-pages";

export function RelatedPagesCard({
  selection,
  model,
  context,
  status,
}: {
  selection: DocumentSelection | null;
  model: DocumentModel | null;
  context: TextSelectionContext | null;
  status: RelatedPagesStatus;
}) {
  return (
    <section className="insight-card context-card">
      <h2>
        <span className="insight-card-icon">
          <ScanText size={18} aria-hidden="true" />
        </span>
        Related pages
      </h2>
      <ul>
        {context?.related_pages.length ? (
          context.related_pages.map((relatedPage) => (
            <li key={relatedPage.page_index}>
              <strong>Page {relatedPage.page_label}</strong>
              <span>{relatedPage.title}</span>
            </li>
          ))
        ) : (
          <li className="waiting">
            {getRelatedPagesMessage(selection, model, context, status)}
          </li>
        )}
      </ul>
    </section>
  );
}

function getRelatedPagesMessage(
  selection: DocumentSelection | null,
  model: DocumentModel | null,
  context: TextSelectionContext | null,
  status: RelatedPagesStatus,
) {
  if (!selection) {
    return "Select text to find related pages.";
  }

  if (!selection.text) {
    return "No readable text was found in this selection.";
  }

  if (!model?.pages[selection.page_index - 1]?.chunks.length) {
    return "This page has no modeled content.";
  }

  if (status === "loading" || status === "idle") {
    return "Finding related pages…";
  }

  if (status === "error") {
    return "Related pages are temporarily unavailable.";
  }

  if (context) {
    return "No related pages were found in this document.";
  }

  return "This selection could not be matched to the page.";
}

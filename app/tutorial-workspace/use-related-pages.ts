"use client";

import { useEffect, useState } from "react";

import type {
  DocumentModel,
  TextSelectionContext,
} from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";

export type RelatedPagesStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

type RelatedPagesResult = {
  selectionKey: string;
  status: "ready" | "error";
  context: TextSelectionContext | null;
};

type RelatedPagesResponse = {
  text_selection?: TextSelectionContext | null;
  message?: string;
};

const RELATED_PAGES_DEBOUNCE_MS = 300;

export function useRelatedPages(
  tutorialId: string,
  model: DocumentModel | null,
  selection: DocumentSelection | null,
) {
  const [result, setResult] = useState<RelatedPagesResult | null>(null);
  const selectionKey = getSelectionKey(selection);
  const activeResult =
    result?.selectionKey === selectionKey ? result : null;
  const hasReusableResult = activeResult?.status === "ready";
  const selectedPageHasChunks = Boolean(
    selection && model?.pages[selection.page_index - 1]?.chunks.length,
  );
  let status: RelatedPagesStatus = "idle";

  if (selection?.text && selectedPageHasChunks) {
    status = activeResult?.status ?? "loading";
  } else if (selection?.text) {
    status = "ready";
  }

  useEffect(() => {
    const controller = new AbortController();

    if (
      !model ||
      !selection?.text ||
      !selectionKey ||
      !selectedPageHasChunks ||
      hasReusableResult
    ) {
      return () => controller.abort();
    }

    const activeSelection = selection;
    const activeSelectionKey = selectionKey;

    async function loadRelatedPages() {
      try {
        const context = await readRelatedPages(
          tutorialId,
          activeSelection,
          controller.signal,
        );
        setResult({
          selectionKey: activeSelectionKey,
          status: "ready",
          context,
        });
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setResult({
            selectionKey: activeSelectionKey,
            status: "error",
            context: null,
          });
        }
      }
    }

    const timeoutId = window.setTimeout(() => {
      void loadRelatedPages();
    }, RELATED_PAGES_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    hasReusableResult,
    model,
    selectedPageHasChunks,
    selection,
    selectionKey,
    tutorialId,
  ]);

  return {
    textSelectionContext: activeResult?.context ?? null,
    relatedPagesStatus: status,
  };
}

async function readRelatedPages(
  tutorialId: string,
  selection: DocumentSelection,
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/tutorials/${tutorialId}/related-pages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_index: selection.page_index,
        selection_text: selection.text,
      }),
      signal,
    },
  );
  const data = (await response.json()) as RelatedPagesResponse;

  if (!response.ok || !("text_selection" in data)) {
    throw new Error(
      data.message ?? "Related pages are temporarily unavailable.",
    );
  }

  return data.text_selection ?? null;
}

function getSelectionKey(selection: DocumentSelection | null) {
  if (!selection?.text) {
    return null;
  }

  return JSON.stringify({
    page_index: selection.page_index,
    bounds: selection.bounds,
    text: selection.text,
  });
}

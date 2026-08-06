import type { DocumentModel } from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";
import { renderPdfPageImage } from "@/lib/pdf-page-renderer";
import {
  buildPageImageContextEvent,
  buildSelectionContextEvent,
} from "@/lib/realtime-tutor/context-events";
import { sendEventAndWait } from "@/lib/realtime-tutor/event-transport";
import {
  buildAuxiliaryPageMetadata,
  buildGuidedPageMetadata,
} from "@/lib/realtime-tutor/instructions";
import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";
import {
  getMaximumMessageSize,
  getMessageByteLength,
} from "@/lib/realtime-tutor/transport";

export async function syncSelectionContext(
  runtime: RealtimeTutorRuntime,
  model: DocumentModel,
  selection: DocumentSelection,
) {
  const selectionKey = JSON.stringify({
    page_index: selection.page_index,
    bounds: selection.bounds,
    text: selection.text,
  });
  const currentItem = runtime.selectionContextItemRef.current;

  if (currentItem?.key === selectionKey) {
    return;
  }

  if (currentItem) {
    await sendEventAndWait(
      runtime,
      {
        type: "conversation.item.delete",
        item_id: currentItem.itemId,
      },
      "conversation.item.deleted",
    );
    runtime.selectionContextItemRef.current = null;
  }

  const event = await sendEventAndWait(
    runtime,
    buildSelectionContextEvent(model, selection),
    "conversation.item.added",
  );
  const itemId = event.item?.id;

  if (!itemId) {
    throw new Error("The selected document context could not be tracked.");
  }

  runtime.selectionContextItemRef.current = {
    key: selectionKey,
    itemId,
  };
}

export async function clearSelectionContext(
  runtime: RealtimeTutorRuntime,
) {
  const currentItem = runtime.selectionContextItemRef.current;

  if (!currentItem) {
    return;
  }

  await deleteConversationItem(runtime, currentItem.itemId);
  runtime.selectionContextItemRef.current = null;
}

export async function replacePageContext(
  runtime: RealtimeTutorRuntime,
  model: DocumentModel,
  pageIndex: number,
  kind: "active" | "auxiliary",
) {
  const documentId = runtime.optionsRef.current.documentId;

  if (!documentId) {
    throw new Error("The active PDF is unavailable.");
  }

  const text =
    kind === "active"
      ? buildGuidedPageMetadata(model, pageIndex)
      : buildAuxiliaryPageMetadata(model, pageIndex);
  const eventId = `client_${crypto.randomUUID()}`;
  const eventWithoutImage = buildPageImageContextEvent(text, "");
  const maximumMessageSize = getMaximumMessageSize(
    runtime.peerConnectionRef.current,
  );
  const eventOverhead = getMessageByteLength({
    ...eventWithoutImage,
    event_id: eventId,
  });
  const imageBudget = maximumMessageSize - eventOverhead - 1;
  const renderedImage = await renderPdfPageImage(
    documentId,
    `/api/tutorials/${documentId}/file`,
    pageIndex,
    imageBudget,
  );
  const contextEvent = buildPageImageContextEvent(
    text,
    renderedImage.imageUrl,
  );

  if (
    getMessageByteLength({ ...contextEvent, event_id: eventId }) >=
    maximumMessageSize
  ) {
    throw new Error(
      "The rendered PDF page is too large for the Realtime connection.",
    );
  }

  if (kind === "active") {
    const activeItem = runtime.activePageContextItemRef.current;

    if (activeItem) {
      await deleteConversationItem(runtime, activeItem.itemId);
      runtime.activePageContextItemRef.current = null;
    }

    const auxiliaryItem = runtime.auxiliaryPageContextItemRef.current;

    if (auxiliaryItem) {
      await deleteConversationItem(runtime, auxiliaryItem.itemId);
      runtime.auxiliaryPageContextItemRef.current = null;
    }
  } else {
    const auxiliaryItem = runtime.auxiliaryPageContextItemRef.current;

    if (auxiliaryItem) {
      await deleteConversationItem(runtime, auxiliaryItem.itemId);
      runtime.auxiliaryPageContextItemRef.current = null;
    }
  }

  const addedEvent = await sendEventAndWait(
    runtime,
    contextEvent,
    "conversation.item.added",
  );
  const itemId = addedEvent.item?.id;

  if (!itemId) {
    throw new Error("The PDF page image context could not be tracked.");
  }

  const pageContextItem = { pageIndex, itemId };

  if (kind === "active") {
    runtime.activePageContextItemRef.current = pageContextItem;
  } else {
    runtime.auxiliaryPageContextItemRef.current = pageContextItem;
  }

  return {
    page_index: pageIndex,
    page_label: model.pages[pageIndex - 1].page_label,
    image_context_attached: true,
  };
}

async function deleteConversationItem(
  runtime: RealtimeTutorRuntime,
  itemId: string,
) {
  await sendEventAndWait(
    runtime,
    {
      type: "conversation.item.delete",
      item_id: itemId,
    },
    "conversation.item.deleted",
  );
}

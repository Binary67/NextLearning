import type { DocumentModel } from "@/lib/document-model";
import type { DocumentSelection } from "@/lib/document-selection";

export function buildPageImageContextEvent(
  text: string,
  imageUrl: string,
) {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text,
        },
        {
          type: "input_image",
          image_url: imageUrl,
        },
      ],
    },
  };
}

export function buildSelectionContextEvent(
  model: DocumentModel,
  selection: DocumentSelection,
) {
  const pageLabel =
    model.pages[selection.page_index - 1]?.page_label ??
    String(selection.page_index);

  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `The learner selected this region on PDF page ${pageLabel}. Treat it as the active selection for the learner's next question.

Extracted selection text:
${selection.text || "(No native PDF text was available; rely on the image.)"}`,
        },
        {
          type: "input_image",
          image_url: selection.image_url,
        },
      ],
    },
  };
}

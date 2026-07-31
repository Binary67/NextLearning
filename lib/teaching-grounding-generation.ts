import { MissingAzureOpenAIConfigurationError } from "@/lib/document-model-generation";
import type { DocumentLayout } from "@/lib/document-layout";
import type { DocumentModel } from "@/lib/document-model";
import {
  teachingGroundingJsonSchema,
  type TeachingGrounding,
  validateTeachingGrounding,
} from "@/lib/teaching-grounding";
import type { TeachingPlan } from "@/lib/teaching-plan";

type AzureOpenAIResponse = {
  status?: string;
  error?: {
    message?: string;
  } | null;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

export async function generateTeachingGrounding(
  model: DocumentModel,
  plan: TeachingPlan,
  layout: DocumentLayout,
): Promise<TeachingGrounding> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_FLAGSHIP_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    throw new MissingAzureOpenAIConfigurationError(
      "Azure OpenAI endpoint, API key, and flagship deployment are required.",
    );
  }

  const response = await fetch(`${endpoint.replace(/\/+$/, "")}/responses`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deployment,
      store: false,
      reasoning: {
        effort: "high",
      },
      max_output_tokens: 64000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildTeachingGroundingPrompt(model, plan, layout),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "teaching_grounding",
          schema: teachingGroundingJsonSchema,
          strict: true,
        },
      },
    }),
  });
  const result = (await response.json()) as AzureOpenAIResponse;

  if (!response.ok) {
    throw new Error(
      result.error?.message ??
        "Azure OpenAI could not ground the teaching plan.",
    );
  }

  if (result.status !== "completed") {
    throw new Error(
      "Azure OpenAI did not finish grounding the teaching plan.",
    );
  }

  const grounding = JSON.parse(readOutputText(result)) as unknown;
  return validateTeachingGrounding(grounding, plan, layout);
}

function buildTeachingGroundingPrompt(
  model: DocumentModel,
  plan: TeachingPlan,
  layout: DocumentLayout,
) {
  const sourcePageIndexes = new Set(
    plan.units.flatMap((unit) =>
      unit.source_anchors.map((anchor) => anchor.page_index),
    ),
  );
  const availableBlocks = layout.pages
    .filter((page) => sourcePageIndexes.has(page.page_index))
    .map((page) => ({
      page_index: page.page_index,
      blocks: page.blocks.map((block) => ({
        id: block.id,
        text: block.text,
      })),
    }));
  const concepts = model.concepts.map((concept) => ({
    id: concept.id,
    name: concept.name,
    definition: concept.definition,
  }));

  return `Connect every teaching move to the extracted PDF blocks that visually support it.

Follow these rules:
- Set document_id to "${plan.document_id}" exactly.
- Return one units entry for every teaching-plan unit, in the same order, using the exact unit_id.
- Cover every teaching_guidance entry. teaching_guidance_index is its zero-based index in the unit.
- Create one focus for a teaching move when one source section is sufficient. Create a second focus with the same teaching_guidance_index only when the move genuinely needs another distinct source section.
- Give every focus a globally unique lowercase kebab-case ID beginning with "focus:".
- Keep teaching_point short and describe what the tutor will explain while the blocks are highlighted.
- page_index must be one of that unit's source anchor pages.
- Select one to six block_ids from the available blocks on that same page.
- Select only blocks that directly support the teaching point. Prefer a compact paragraph or a few adjacent blocks.
- Never invent, rewrite, or infer a block ID. Do not generate coordinates.
- Do not create session state, learner progress, captions, or tutor dialogue.

Document concepts:
${JSON.stringify(concepts)}

Teaching plan:
${JSON.stringify(plan)}

Available extracted blocks:
${JSON.stringify(availableBlocks)}`;
}

function readOutputText(result: AzureOpenAIResponse) {
  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        throw new Error(
          content.refusal ??
            "Azure OpenAI declined to ground the teaching plan.",
        );
      }

      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  throw new Error("Azure OpenAI returned no teaching grounding.");
}

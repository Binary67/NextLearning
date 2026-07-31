import {
  type AzureOpenAIErrorDetails,
  InvalidAzureOpenAIContentError,
  retryAzureOpenAIGeneration,
} from "@/lib/azure-openai-generation-retry";
import { MissingAzureOpenAIConfigurationError } from "@/lib/document-model-generation";
import type { DocumentLayout } from "@/lib/document-layout";
import type { DocumentModel } from "@/lib/document-model";
import { readAzureOpenAIResponseStream } from "@/lib/azure-openai-response-stream";
import {
  teachingGroundingJsonSchema,
  type TeachingGrounding,
  validateTeachingGrounding,
} from "@/lib/teaching-grounding";
import type { TeachingPlan } from "@/lib/teaching-plan";

type AzureOpenAIResponse = {
  status?: string;
  error?: AzureOpenAIErrorDetails;
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

  return retryAzureOpenAIGeneration(async () => {
    const response = await fetch(
      `${endpoint.replace(/\/+$/, "")}/responses`,
      {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: deployment,
          store: false,
          stream: true,
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
      },
    );
    const result = await readAzureOpenAIResponseStream<AzureOpenAIResponse>(
      response,
      "Azure OpenAI could not ground the teaching plan.",
    );

    if (result.status !== "completed") {
      throw new Error(
        "Azure OpenAI did not finish grounding the teaching plan.",
      );
    }

    const outputText = readOutputText(result);

    try {
      const grounding = JSON.parse(outputText) as unknown;
      return validateTeachingGrounding(grounding, plan, layout);
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        "Azure OpenAI returned invalid teaching grounding.",
        error,
      );
    }
  });
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
- Give each unit between one and 24 focuses.
- Cover every lesson_steps entry using its exact lesson_step_id, and keep focuses grouped in lesson-step order.
- Create one focus for a lesson step when one source section is sufficient. Create another focus with the same lesson_step_id only when the step genuinely needs a distinct paragraph, formula, figure, or table.
- Give every focus a globally unique lowercase kebab-case ID beginning with "focus:".
- Keep teaching_point short and describe what the selected blocks support. The detailed instructional content already exists in the lesson step.
- page_index must be one of that unit's source anchor pages.
- Select one to six block_ids from the available blocks on that same page.
- Select only blocks that directly support the teaching point. Prefer a compact paragraph or a few adjacent blocks.
- Reuse the most relevant source blocks for practice, assessment, or recap when those steps do not introduce new evidence. More lesson detail does not require a different highlight for every sentence.
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

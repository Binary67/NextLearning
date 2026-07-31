import { MissingAzureOpenAIConfigurationError } from "@/lib/document-model-generation";
import type { DocumentModel } from "@/lib/document-model";
import {
  teachingPlanJsonSchema,
  type TeachingPlan,
  validateTeachingPlan,
} from "@/lib/teaching-plan";

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

export async function generateTeachingPlan(
  file: File,
  model: DocumentModel,
): Promise<TeachingPlan> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_FLAGSHIP_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    throw new MissingAzureOpenAIConfigurationError(
      "Azure OpenAI endpoint, API key, and flagship deployment are required.",
    );
  }

  const fileData = Buffer.from(await file.arrayBuffer()).toString("base64");
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
      max_output_tokens: 32000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: file.name,
              file_data: `data:application/pdf;base64,${fileData}`,
              detail: "high",
            },
            {
              type: "input_text",
              text: buildTeachingPlanPrompt(model),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "teaching_plan",
          schema: teachingPlanJsonSchema,
          strict: true,
        },
      },
    }),
  });
  const result = (await response.json()) as AzureOpenAIResponse;

  if (!response.ok) {
    throw new Error(
      result.error?.message ??
        "Azure OpenAI could not build the teaching plan.",
    );
  }

  if (result.status !== "completed") {
    throw new Error(
      "Azure OpenAI did not finish building the teaching plan.",
    );
  }

  const teachingPlan = JSON.parse(readOutputText(result)) as unknown;
  return validateTeachingPlan(teachingPlan, model);
}

function buildTeachingPlanPrompt(model: DocumentModel) {
  return `Review the complete PDF and the validated document model below before producing the teaching plan.

Create a learner-independent teaching plan for this document. Follow these rules:
- Set document_id to "${model.document_id}" exactly.
- Set title to "${model.title}" exactly.
- Treat the units array order as the recommended teaching order. Optimize for learning rather than PDF page order.
- Make each unit one small, assessable knowledge point with one observable objective. Split broad topics into multiple units.
- Use only concept IDs that appear in the document model. A unit may use multiple concepts, and a concept may appear in multiple units when the objectives differ.
- prerequisite_unit_ids may reference only units that appear earlier in the units array. Add a prerequisite only when it is genuinely needed for the unit objective.
- Ground every unit in the PDF. Each source anchor must use a page where at least one of the unit's concept IDs occurs in the document model.
- Use page_index and page_label exactly as represented by the relevant document occurrence.
- A source page may be revisited by multiple units when it serves different teaching purposes.
- Keep teaching_guidance concise and actionable. Describe instructional moves, not a word-for-word tutor script.
- Make mastery_criteria observable evidence that the knowledge point has been learned. Do not write a full quiz.
- Record only likely, concept-specific common difficulties. Use an empty array when none are supported.
- Do not generate learner personalization, session state, progress tracking, timing, realtime behavior, or external lessons that are not grounded in this PDF.

Validated document model:
${JSON.stringify(model)}`;
}

function readOutputText(result: AzureOpenAIResponse) {
  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        throw new Error(
          content.refusal ??
            "Azure OpenAI declined to build the teaching plan.",
        );
      }

      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  throw new Error("Azure OpenAI returned no teaching plan.");
}

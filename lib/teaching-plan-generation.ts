import {
  InvalidAzureOpenAIContentError,
  readAzureOpenAIGenerationConfiguration,
  retryAzureOpenAIGeneration,
} from "@/lib/azure-openai-generation-retry";
import type { DocumentModel } from "@/lib/document-model";
import {
  type AzureOpenAIResponse,
  readAzureOpenAIOutputText,
  readAzureOpenAIResponseStream,
} from "@/lib/azure-openai-response";
import {
  teachingPlanJsonSchema,
  type TeachingPlan,
  validateTeachingPlan,
} from "@/lib/teaching-plan";

export async function generateTeachingPlan(
  file: File,
  model: DocumentModel,
): Promise<TeachingPlan> {
  const { endpoint, apiKey, deployment } =
    readAzureOpenAIGenerationConfiguration();

  const fileData = Buffer.from(await file.arrayBuffer()).toString("base64");
  return retryAzureOpenAIGeneration(async () => {
    const response = await fetch(`${endpoint}/responses`, {
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

    const result = await readAzureOpenAIResponseStream<AzureOpenAIResponse>(
      response,
      "Azure OpenAI could not build the teaching plan.",
    );

    if (result.status !== "completed") {
      throw new Error(
        "Azure OpenAI did not finish building the teaching plan.",
      );
    }

    const outputText = readAzureOpenAIOutputText(
      result,
      "Azure OpenAI declined to build the teaching plan.",
      "Azure OpenAI returned no teaching plan.",
    );

    try {
      const teachingPlan = JSON.parse(outputText) as unknown;
      return validateTeachingPlan(teachingPlan, model);
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        "Azure OpenAI returned an invalid teaching plan.",
        error,
      );
    }
  });
}

function buildTeachingPlanPrompt(model: DocumentModel) {
  return `Review the complete PDF and the validated document model below before producing the teaching plan.

Create a learner-independent teaching plan for this document. Follow these rules:
- Set document_id to "${model.document_id}" exactly.
- Set title to "${model.title}" exactly.
- Return between one and 120 units.
- Treat the units array order as the recommended teaching order. Optimize for learning rather than PDF page order.
- Make each unit one small, assessable knowledge point with one observable objective. Split broad topics into multiple units.
- Give each unit between one and 12 unique concept_ids, using only IDs that appear in the document model. A unit may use multiple concepts, and a concept may appear in multiple units when the objectives differ.
- Give each unit no more than 12 unique prerequisite_unit_ids. They may reference only units that appear earlier in the units array. Add a prerequisite only when it is genuinely needed for the unit objective.
- Ground every unit in the PDF. Each source anchor must use a page where at least one of the unit's concept IDs occurs in the document model.
- Give each unit between one and 20 source anchors.
- Use page_index and page_label exactly as represented by the relevant document occurrence.
- A source page may be revisited by multiple units when it serves different teaching purposes.
- Give every lesson step a globally unique lowercase kebab-case ID beginning with "step:".
- Build every unit as a six-to-ten-step mini-tutorial. The first step must be motivate and the last must be recap. Include at least one explain, demonstrate, practice, and assess step between them. Add contrast or connect steps when they improve understanding.
- Keep every step tightly focused on the unit objective, but make content substantive. Use two to four complete sentences to state what the tutor must teach, including the relevant reasoning, mechanism, terminology, notation, or interpretation.
- The motivate step must establish the problem and why the knowledge point matters in this document.
- The explain step must give a precise account rather than only an analogy or simplified definition.
- The demonstrate step must trace a concrete example, formula, architecture flow, figure, or table supported by the document.
- Use contrast to distinguish a likely confusion or non-example. Use connect to relate the unit to a prerequisite or explain why a later concept follows.
- Practice is a guided application. Assess is an independent mastery check. For both kinds, provide a learner_prompt, the expected_response used as a private rubric, and remediation that gives the tutor a specific alternative explanation. Set those three fields to null for every other step kind.
- The recap step must synthesize two or three durable takeaways without adding new material.
- Give each unit between one and eight mastery_criteria. Make them observable evidence that the learner can explain or apply the knowledge point. Do not accept recognition or repetition alone when the document supports a stronger check.
- Give each unit no more than eight concept-specific common_difficulties. Use an empty array when none are supported.
- Source anchors must collectively support the lesson steps. Simple illustrative examples and contrasts may be constructed from the document's concepts, but do not introduce unrelated external lessons.
- Do not generate learner personalization, session state, progress tracking, timing, or realtime behavior.

Validated document model:
${JSON.stringify(model)}`;
}

import {
  InvalidAzureOpenAIContentError,
  readAzureOpenAIGenerationConfiguration,
  retryAzureOpenAIGeneration,
} from "@/lib/azure-openai-generation-retry";
import {
  type AzureOpenAIResponse,
  readAzureOpenAIOutputText,
  readAzureOpenAIResponseStream,
} from "@/lib/azure-openai-response";
import {
  documentModelJsonSchema,
  type DocumentModel,
  validateDocumentModel,
} from "@/lib/document-model";
import {
  teachingPlanJsonSchema,
  type TeachingPlan,
  validateTeachingPlan,
} from "@/lib/teaching-plan";

type GeneratedTutorial = {
  model: DocumentModel;
  plan: TeachingPlan;
};

const generatedTutorialJsonSchema = {
  type: "object",
  properties: {
    document_model: documentModelJsonSchema,
    teaching_plan: teachingPlanJsonSchema,
  },
  required: ["document_model", "teaching_plan"],
  additionalProperties: false,
} as const;

export async function generateTutorial(
  file: File,
  tutorialId: string,
): Promise<GeneratedTutorial> {
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
                text: buildTutorialPrompt(tutorialId),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tutorial",
            schema: generatedTutorialJsonSchema,
            strict: true,
          },
        },
      }),
    });

    const result = await readAzureOpenAIResponseStream<AzureOpenAIResponse>(
      response,
      "Azure OpenAI could not prepare the tutorial.",
    );

    if (result.status !== "completed") {
      throw new Error("Azure OpenAI did not finish preparing the tutorial.");
    }

    const outputText = readAzureOpenAIOutputText(
      result,
      "Azure OpenAI declined to prepare the tutorial.",
      "Azure OpenAI returned no tutorial.",
    );

    try {
      const tutorial = JSON.parse(outputText) as unknown;

      if (!isRecord(tutorial)) {
        throw new Error("The generated tutorial is not an object.");
      }

      const model = validateDocumentModel(
        tutorial.document_model,
        tutorialId,
      );
      const plan = validateTeachingPlan(tutorial.teaching_plan, model);

      return { model, plan };
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        "Azure OpenAI returned an invalid tutorial.",
        error,
      );
    }
  });
}

function buildTutorialPrompt(tutorialId: string) {
  return `Review the complete PDF once, then produce both the document_model and teaching_plan in the same response.

First create document_model as a compact concept map for an interactive tutor. Follow these rules:
- Set document_id to "${tutorialId}" exactly.
- Use 1-based PDF order for page_index.
- Use the printed page number for page_label when visible; otherwise use page_index as a string.
- Give each concept a stable lowercase kebab-case ID beginning with "concept:".
- Return no more than 120 concepts and no more than 400 connections.
- Merge aliases and repeated explanations into one concept.
- Keep definitions short and grounded in this document.
- Give every concept between one and 40 meaningful occurrences. Use implicit references sparingly and lower their confidence.
- Record at most one occurrence for a concept on each page. Choose the most useful teaching role.
- Create only pedagogically useful, document-supported connections.
- Make connection direction match the relationship name.
- Give every connection between one and 20 relevant_pages containing the pages that support it.
- Keep every occurrence and connection confidence between 0 and 1 inclusive.
- Keep document_model limited to document structure and concepts. Put all lesson content in teaching_plan.

Then create teaching_plan from the concepts and occurrences in document_model. Follow these rules:
- Set document_id to "${tutorialId}" exactly.
- Set title to the exact document_model title.
- Return between one and 120 units.
- Treat the units array order as the recommended teaching order. Optimize for learning rather than PDF page order.
- Make each unit one small, assessable knowledge point with one observable objective. Split broad topics into multiple units.
- Give each unit between one and 12 unique concept_ids, using only IDs from document_model. A unit may use multiple concepts, and a concept may appear in multiple units when the objectives differ.
- Give each unit no more than 12 unique prerequisite_unit_ids. They may reference only units that appear earlier in the units array. Add a prerequisite only when it is genuinely needed for the unit objective.
- Ground every unit in the PDF. Each source anchor must use a page where at least one of the unit's concept IDs occurs in document_model.
- Give each unit between one and 20 source anchors.
- Give every source anchor a globally unique lowercase kebab-case ID beginning with "source:".
- Use page_index and page_label exactly as represented by the relevant document_model occurrence.
- A source page may be revisited by multiple units when it serves different teaching purposes.
- Give every lesson step a globally unique lowercase kebab-case ID beginning with "step:".
- Set visual_source_anchor_id on a lesson step to the ID of the one source anchor the tutor should see while teaching that step. Use only anchors from the same unit. Set it to null when a page image would not materially help the explanation.
- Reuse the same source anchor ID across steps when they need the same page. Do not create unused source anchors or duplicate page metadata in lesson steps.
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
- Do not generate learner personalization, session state, progress tracking, timing, or realtime behavior.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

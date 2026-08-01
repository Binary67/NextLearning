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
  teachingUnitDetailsJsonSchema,
  type TeachingPlan,
  type TeachingUnitDetails,
  type TeachingUnitOutline,
  validateTeachingPlan,
  validateTeachingUnitDetails,
} from "@/lib/teaching-plan";

type GeneratedTutorial = {
  model: DocumentModel;
  plan: TeachingPlan;
  firstUnitDetails: TeachingUnitDetails;
};

const generatedTutorialJsonSchema = {
  type: "object",
  properties: {
    document_model: documentModelJsonSchema,
    teaching_plan: teachingPlanJsonSchema,
    first_unit_details: teachingUnitDetailsJsonSchema,
  },
  required: [
    "document_model",
    "teaching_plan",
    "first_unit_details",
  ],
  additionalProperties: false,
} as const;

export async function generateTutorial(
  fileData: Buffer,
  fileName: string,
  tutorialId: string,
): Promise<GeneratedTutorial> {
  const encodedFile = fileData.toString("base64");

  return retryAzureOpenAIGeneration(async () => {
    const outputText = await requestStructuredGeneration(
      [
        {
          type: "input_file",
          filename: fileName,
          file_data: `data:application/pdf;base64,${encodedFile}`,
          detail: "high",
        },
        {
          type: "input_text",
          text: buildTutorialPrompt(tutorialId),
        },
      ],
      generatedTutorialJsonSchema,
      "tutorial",
      "Azure OpenAI could not prepare the tutorial.",
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
      const firstUnit = plan.units[0];
      const firstUnitDetails = validateTeachingUnitDetails(
        tutorial.first_unit_details,
        plan,
        firstUnit,
      );

      return { model, plan, firstUnitDetails };
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        "Azure OpenAI returned an invalid tutorial.",
        error,
      );
    }
  });
}

export async function generateTeachingUnitDetails(
  model: DocumentModel,
  plan: TeachingPlan,
  unit: TeachingUnitOutline,
) {
  return retryAzureOpenAIGeneration(async () => {
    const outputText = await requestStructuredGeneration(
      [
        {
          type: "input_text",
          text: buildTeachingUnitPrompt(model, plan, unit),
        },
      ],
      teachingUnitDetailsJsonSchema,
      "teaching_unit",
      `Azure OpenAI could not prepare ${unit.id}.`,
    );

    try {
      return validateTeachingUnitDetails(
        JSON.parse(outputText) as unknown,
        plan,
        unit,
      );
    } catch (error) {
      throw new InvalidAzureOpenAIContentError(
        `Azure OpenAI returned invalid details for ${unit.id}.`,
        error,
      );
    }
  });
}

async function requestStructuredGeneration(
  content: object[],
  schema: object,
  schemaName: string,
  fallbackMessage: string,
) {
  const { endpoint, apiKey, deployment } =
    readAzureOpenAIGenerationConfiguration();
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
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
          strict: true,
        },
      },
    }),
  });
  const result = await readAzureOpenAIResponseStream<AzureOpenAIResponse>(
    response,
    fallbackMessage,
  );

  if (result.status !== "completed") {
    throw new Error(`${fallbackMessage} The response did not complete.`);
  }

  return readAzureOpenAIOutputText(
    result,
    "Azure OpenAI declined to prepare the tutorial.",
    "Azure OpenAI returned no generated content.",
  );
}

function buildTutorialPrompt(tutorialId: string) {
  return `Review the complete PDF once, then produce document_model, a compact teaching_plan, and detailed content for only the first teaching unit.

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

Then create teaching_plan as a compact outline. Follow these rules:
- Set document_id to "${tutorialId}" exactly and title to the exact document_model title.
- Return between one and 120 units in recommended teaching order.
- Make each unit one small, assessable knowledge point with one observable objective.
- Give each unit between one and 12 unique concept_ids from document_model.
- Give each unit no more than 12 unique prerequisite_unit_ids that reference only earlier units.
- Give each unit between one and 20 source anchors grounded on pages where its concepts occur.
- Give every source anchor a globally unique lowercase kebab-case ID beginning with "source:".
- Use page_index and page_label exactly as represented by the relevant document_model occurrence.
- For grounding_summary, capture the exact document-specific explanation, mechanism, example, formula, figure, or table evidence needed to write the later lesson. Use one to three concise sentences.
- Give every lesson step a globally unique lowercase kebab-case ID beginning with "step:".
- Build every unit as a six-to-ten-step outline. The first step must be motivate and the last recap. Include explain, demonstrate, practice, and assess.
- Each lesson step contains only id, kind, title, and visual_source_anchor_id.
- Set visual_source_anchor_id to an anchor from the same unit when a page image materially helps; otherwise set it to null.
- Do not put detailed content, learner prompts, expected responses, remediation, mastery criteria, or common difficulties in teaching_plan.

Finally create first_unit_details for teaching_plan.units[0] only:
- Set document_id to "${tutorialId}" and unit_id to the first unit ID.
- Return one detail record for every outlined lesson step, in exactly the same order and with exactly the same step IDs.
- Write two to four substantive sentences of content per step using the unit's concepts and grounding summaries.
- Motivate must establish the problem and relevance. Explain must be precise. Demonstrate must trace document-supported evidence. Recap must synthesize two or three durable takeaways.
- Practice is guided application and assess is an independent mastery check. For both, provide learner_prompt, expected_response, and specific remediation. Set those three fields to null for all other step kinds.
- Give the unit between one and eight observable mastery_criteria and no more than eight concept-specific common_difficulties.
- Do not introduce unrelated external lessons, personalization, session state, progress tracking, timing, or realtime behavior.`;
}

function buildTeachingUnitPrompt(
  model: DocumentModel,
  plan: TeachingPlan,
  unit: TeachingUnitOutline,
) {
  const conceptIds = new Set(unit.concept_ids);
  const concepts = model.concepts.filter((concept) =>
    conceptIds.has(concept.id),
  );
  const connections = model.connections.filter(
    (connection) =>
      conceptIds.has(connection.from) || conceptIds.has(connection.to),
  );
  const prerequisites = unit.prerequisite_unit_ids.map((unitId) => {
    const prerequisite = plan.units.find((item) => item.id === unitId);

    return prerequisite
      ? {
          id: prerequisite.id,
          title: prerequisite.title,
          objective: prerequisite.objective,
        }
      : { id: unitId };
  });

  return `Create detailed lesson content for exactly one outlined teaching unit.

Document and unit context:
${JSON.stringify({
  document_id: plan.document_id,
  document_title: plan.title,
  unit,
  prerequisites,
  concepts,
  connections,
})}

Rules:
- Set schema_version, document_id, and unit_id exactly as requested by the schema and context.
- Return one detail record for every outlined lesson step, in exactly the same order and with exactly the same step IDs.
- Use only the supplied concepts, connections, and source grounding summaries as document evidence.
- Write two to four substantive sentences of content per step, including the relevant reasoning, mechanism, terminology, notation, or interpretation.
- Motivate must establish the problem and relevance. Explain must be precise. Demonstrate must trace a concrete supplied example, formula, architecture flow, figure, or table. Recap must synthesize two or three durable takeaways.
- Practice is guided application and assess is an independent mastery check. For both, provide learner_prompt, expected_response, and specific remediation. Set those three fields to null for all other step kinds.
- Give the unit between one and eight observable mastery_criteria and no more than eight concept-specific common_difficulties.
- Do not invent unsupported document claims or introduce unrelated external lessons.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

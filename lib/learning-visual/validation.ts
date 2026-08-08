import {
  learningVisualStrategies,
  MAX_LEARNING_VISUAL_PAGE_IMAGE_URL_LENGTH,
  type LearningVisualCue,
  type LearningVisualGenerationInput,
  type LearningVisualRequest,
  type LearningVisualStrategy,
} from "@/lib/learning-visual/types";

const INPUT_KEYS = [
  "request",
  "pageIndex",
  "chunkId",
  "selectionText",
  "pageImageUrl",
  "explanationStyle",
] as const;
const OUTPUT_KEYS = [
  "title",
  "strategy",
  "htmlFragment",
  "narrationCues",
  "altText",
] as const;
const MAX_MODEL_OUTPUT_LENGTH = 160_000;
const MAX_HTML_FRAGMENT_LENGTH = 120_000;
const MAX_CUE_COUNT = 24;
const CUE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

type GeneratedLearningVisual = {
  title: string;
  strategy: LearningVisualStrategy;
  htmlFragment: string;
  narrationCues: LearningVisualCue[];
  altText: string;
};

export class LearningVisualInputError extends Error {}
export class InvalidLearningVisualOutputError extends Error {}

export function parseLearningVisualGenerationInput(
  value: unknown,
): LearningVisualGenerationInput {
  if (!isExactRecord(value, INPUT_KEYS)) {
    throw invalidInput();
  }

  const request = parseLearningVisualRequest(value.request);
  const chunkId = readNullableInputText(value.chunkId, 200);
  const selectionText = readNullableInputText(
    value.selectionText,
    20_000,
  );
  const pageImageUrl = readInputText(
    value.pageImageUrl,
    MAX_LEARNING_VISUAL_PAGE_IMAGE_URL_LENGTH,
  );
  const explanationStyle = value.explanationStyle;

  if (
    chunkId === undefined ||
    selectionText === undefined ||
    !isPositiveInteger(value.pageIndex) ||
    !isPageImageUrl(pageImageUrl) ||
    (explanationStyle !== "plain" &&
      explanationStyle !== "technical")
  ) {
    throw invalidInput();
  }

  return {
    request,
    pageIndex: value.pageIndex,
    chunkId,
    selectionText,
    pageImageUrl,
    explanationStyle,
  };
}

function parseLearningVisualRequest(
  value: unknown,
): LearningVisualRequest {
  if (isExactRecord(value, ["origin"]) && value.origin === "learner") {
    return { origin: "learner" };
  }

  if (
    !isExactRecord(value, [
      "origin",
      "learnerQuestion",
      "confusionSummary",
      "learningGoal",
    ]) ||
    value.origin !== "tutor"
  ) {
    throw invalidInput();
  }

  const learnerQuestion = readInputText(value.learnerQuestion, 4_000);
  const confusionSummary = readInputText(value.confusionSummary, 4_000);
  const learningGoal = readInputText(value.learningGoal, 2_000);

  if (!learnerQuestion || !confusionSummary || !learningGoal) {
    throw invalidInput();
  }

  return {
    origin: "tutor",
    learnerQuestion,
    confusionSummary,
    learningGoal,
  };
}

export function validateLearningVisualOutput(
  outputText: string,
): GeneratedLearningVisual {
  if (outputText.length > MAX_MODEL_OUTPUT_LENGTH) {
    throw invalidOutput();
  }

  let value: unknown;

  try {
    value = JSON.parse(outputText) as unknown;
  } catch {
    throw invalidOutput();
  }

  if (
    !isExactRecord(value, OUTPUT_KEYS) ||
    !isOutputText(value.title, 200) ||
    !isLearningVisualStrategy(value.strategy) ||
    !isOutputText(value.htmlFragment, MAX_HTML_FRAGMENT_LENGTH) ||
    !Array.isArray(value.narrationCues) ||
    value.narrationCues.length === 0 ||
    value.narrationCues.length > MAX_CUE_COUNT ||
    !isOutputText(value.altText, 1_000)
  ) {
    throw invalidOutput();
  }

  const narrationCues = validateNarrationCues(value.narrationCues);
  validateHtmlFragment(value.htmlFragment, narrationCues);

  return {
    title: value.title.trim(),
    strategy: value.strategy,
    htmlFragment: value.htmlFragment.trim(),
    narrationCues,
    altText: value.altText.trim(),
  };
}

function validateNarrationCues(value: unknown[]): LearningVisualCue[] {
  const ids = new Set<string>();

  return value.map((cue) => {
    if (
      !isExactRecord(cue, ["id", "label", "meaning"]) ||
      typeof cue.id !== "string" ||
      !CUE_ID_PATTERN.test(cue.id) ||
      !isOutputText(cue.label, 160) ||
      !isOutputText(cue.meaning, 500) ||
      ids.has(cue.id)
    ) {
      throw invalidOutput();
    }

    ids.add(cue.id);
    return {
      id: cue.id,
      label: cue.label.trim(),
      meaning: cue.meaning.trim(),
    };
  });
}

function validateHtmlFragment(
  htmlFragment: string,
  narrationCues: LearningVisualCue[],
) {
  if (
    /<!doctype|<\/?(?:html|head|body)\b/i.test(htmlFragment) ||
    /<(?:base|link|meta|iframe|object|embed|img|audio|video|source|form)\b/i.test(
      htmlFragment,
    ) ||
    /\b(?:src|href|action|formaction|poster)\s*=/i.test(htmlFragment) ||
    /(?:@import|url\s*\(|https?:\/\/|data:|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|sendBeacon\s*\(|importScripts\s*\(|\bimport\s*\()/i.test(
      htmlFragment,
    ) ||
    /\son[a-z]+\s*=/i.test(htmlFragment) ||
    !/<[^>]+\bdata-learning-visual(?:\s|=|>)/i.test(htmlFragment) ||
    !/<style\b[^>]*>[\s\S]*\[data-learning-visual\][\s\S]*<\/style>/i.test(
      htmlFragment,
    ) ||
    /<style\b[^>]*>[\s\S]*(?:\bhtml\b|\bbody\b|:root)[\s\S]*<\/style>/i.test(
      htmlFragment,
    ) ||
    !/<script\b[^>]*>[\s\S]*<\/script>/i.test(htmlFragment) ||
    !hasOneBalancedRoot(htmlFragment)
  ) {
    throw invalidOutput();
  }

  for (const cue of narrationCues) {
    const cueElement = new RegExp(
      `<[^>]*\\bdata-narration-cue\\s*=\\s*(["'])${escapeRegExp(cue.id)}\\1[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
      "i",
    ).exec(htmlFragment);

    if (
      !cueElement ||
      !normalizeVisibleText(cueElement[2]).includes(
        normalizeVisibleText(cue.label),
      )
    ) {
      throw invalidOutput();
    }
  }
}

function hasOneBalancedRoot(htmlFragment: string) {
  const stack: string[] = [];
  let rootCount = 0;
  const tagPattern = /<\s*(\/?)\s*([a-z][a-z0-9-]*)\b[^>]*>/gi;

  for (const match of htmlFragment.matchAll(tagPattern)) {
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const selfClosing = /\/\s*>$/.test(match[0]) || VOID_ELEMENTS.has(tag);

    if (closing) {
      if (stack.pop() !== tag) {
        return false;
      }
      continue;
    }

    if (selfClosing) {
      if (stack.length === 0) {
        rootCount += 1;
      }
      continue;
    }

    if (stack.length === 0) {
      rootCount += 1;
    }
    stack.push(tag);
  }

  return stack.length === 0 && rootCount === 1;
}

function normalizeVisibleText(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function isPageImageUrl(value: string | null): value is string {
  if (!value) {
    return false;
  }

  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function isLearningVisualStrategy(
  value: unknown,
): value is LearningVisualStrategy {
  return learningVisualStrategies.some((strategy) => strategy === value);
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1
  );
}

function readInputText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 && text.length <= maximumLength ? text : null;
}

function readNullableInputText(value: unknown, maximumLength: number) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  return text.length > 0 && text.length <= maximumLength
    ? text
    : undefined;
}

function isOutputText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function isExactRecord<const T extends readonly string[]>(
  value: unknown,
  keys: T,
): value is Record<T[number], unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function invalidInput() {
  return new LearningVisualInputError(
    "A valid learning-visual request is required.",
  );
}

function invalidOutput() {
  return new InvalidLearningVisualOutputError(
    "Azure OpenAI returned an invalid learning visual.",
  );
}

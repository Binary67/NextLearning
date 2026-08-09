import type { PdfTextRegion } from "@/lib/pdf-text-regions";
import type {
  GroundingTextRegion,
  PdfToken,
  SearchablePage,
  TextToken,
} from "@/lib/document-highlight-types";

const TOKEN_PATTERN =
  /[\p{L}\p{M}\p{N}]+(?:[\p{Pd}\u2212][\p{L}\p{M}\p{N}]+)*|[\p{P}\p{S}]+/gu;
const DASH_PATTERN = /[\p{Pd}\u2212]/u;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{M}\p{N}]/u;

export function buildPageText(
  textRegions: readonly PdfTextRegion[],
): string {
  return textRegions
    .map((region) => region.text.replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

export function createSearchablePage(
  textRegions: PdfTextRegion[],
  pageIndex: number,
): SearchablePage {
  const regions = textRegions as GroundingTextRegion[];
  const tokens = regions.flatMap((region, regionIndex) =>
    tokenize(region.text).map((token) => ({
      value: token.value,
      pageIndex,
      fragments: [
        {
          regionIndex,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
        },
      ],
    })),
  );

  return {
    pageIndex,
    regions,
    tokens: addAlternatePdfTokens(tokens, regions),
  };
}

export function tokenizeSourceText(value: string) {
  const dehyphenated = value.replace(
    /([\p{L}\p{M}\p{N}])[\p{Pd}\u2212](?:\r\n|[\r\n])(?=[\p{L}\p{M}\p{N}])/gu,
    "$1",
  );
  return tokenize(dehyphenated);
}

function tokenize(value: string): TextToken[] {
  return Array.from(value.matchAll(TOKEN_PATTERN), (match) => {
    const matchedText = match[0];
    const normalized = matchedText
      .toLocaleLowerCase("en-US")
      .normalize("NFKD");
    const value = WORD_CHARACTER_PATTERN.test(normalized[0])
      ? normalized.replace(/[\p{Pd}\u2212]/gu, "")
      : normalizePunctuation(normalized);
    const startOffset = match.index;

    return {
      value,
      startOffset,
      endOffset: startOffset + matchedText.length,
    };
  });
}

function normalizePunctuation(value: string) {
  return Array.from(value, normalizePunctuationCharacter).join("");
}

function normalizePunctuationCharacter(value: string) {
  if (DASH_PATTERN.test(value)) {
    return "-";
  }

  if (/[‘’‚‛`´]/u.test(value)) {
    return "'";
  }

  if (/[“”„‟]/u.test(value)) {
    return '"';
  }

  return value;
}

function addAlternatePdfTokens(
  tokens: PdfToken[],
  regions: GroundingTextRegion[],
) {
  const alternatesByEndIndex = new Map<number, PdfToken[]>();

  function addAlternate(endIndex: number, token: PdfToken) {
    const alternates = alternatesByEndIndex.get(endIndex) ?? [];
    alternates.push({ ...token, synthetic: true });
    alternatesByEndIndex.set(endIndex, alternates);
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    const first = tokens[index];
    const hyphen = tokens[index + 1];
    const second = tokens[index + 2];
    const firstFragment = first.fragments.at(-1);
    const hyphenFragment = hyphen?.fragments[0];
    const secondFragment = second?.fragments[0];
    const firstRegion = firstFragment
      ? regions[firstFragment.regionIndex]
      : null;

    if (
      firstRegion &&
      hyphen?.value === "-" &&
      firstFragment?.regionIndex === hyphenFragment?.regionIndex &&
      secondFragment &&
      secondFragment.regionIndex !== firstFragment.regionIndex &&
      DASH_PATTERN.test(firstRegion.text.at(-1) ?? "") &&
      WORD_CHARACTER_PATTERN.test(second.value[0])
    ) {
      addAlternate(index + 2, {
        value: first.value + second.value,
        pageIndex: first.pageIndex,
        fragments: [...first.fragments, ...second.fragments],
      });
    }
  }

  for (let start = 0; start < tokens.length - 1; start += 1) {
    const first = tokens[start];

    if (!WORD_CHARACTER_PATTERN.test(first.value[0])) {
      continue;
    }

    let value = first.value;
    let wordCount = 1;
    const fragments = [...first.fragments];

    for (
      let end = start + 1;
      end < Math.min(tokens.length, start + 4);
      end += 1
    ) {
      const previous = tokens[end - 1];
      const current = tokens[end];

      if (
        !tokensAreVisuallyAdjacent(previous, current, regions) ||
        (!WORD_CHARACTER_PATTERN.test(current.value[0]) &&
          current.value !== "-")
      ) {
        break;
      }

      fragments.push(...current.fragments);

      if (WORD_CHARACTER_PATTERN.test(current.value[0])) {
        value += current.value;
        wordCount += 1;
      }

      if (wordCount > 1) {
        addAlternate(end, {
          value,
          pageIndex: first.pageIndex,
          fragments: [...fragments],
        });
      }
    }
  }

  for (let start = 0; start < tokens.length - 1; start += 1) {
    const first = tokens[start];

    if (WORD_CHARACTER_PATTERN.test(first.value[0])) {
      continue;
    }

    let value = first.value;
    const fragments = [...first.fragments];

    for (
      let end = start + 1;
      end < Math.min(tokens.length, start + 4);
      end += 1
    ) {
      const current = tokens[end];

      if (
        WORD_CHARACTER_PATTERN.test(current.value[0]) ||
        !tokensAreVisuallyAdjacent(tokens[end - 1], current, regions)
      ) {
        break;
      }

      value += current.value;
      fragments.push(...current.fragments);
      addAlternate(end, {
        value,
        pageIndex: first.pageIndex,
        fragments: [...fragments],
      });
    }
  }

  return tokens.flatMap((token, index) => [
    token,
    ...(alternatesByEndIndex.get(index) ?? []),
  ]);
}

function tokensAreVisuallyAdjacent(
  left: PdfToken,
  right: PdfToken,
  regions: GroundingTextRegion[],
) {
  const leftFragment = left.fragments.at(-1);
  const rightFragment = right.fragments[0];

  if (
    !leftFragment ||
    !rightFragment ||
    leftFragment.regionIndex === rightFragment.regionIndex
  ) {
    return false;
  }

  const leftRegion = regions[leftFragment.regionIndex];
  const rightRegion = regions[rightFragment.regionIndex];
  const verticalOverlap =
    Math.min(
      leftRegion.y + leftRegion.height,
      rightRegion.y + rightRegion.height,
    ) - Math.max(leftRegion.y, rightRegion.y);
  const minimumHeight = Math.min(leftRegion.height, rightRegion.height);
  const horizontalGap =
    rightRegion.x - (leftRegion.x + leftRegion.width);
  const referenceHeight = Math.max(leftRegion.height, rightRegion.height);

  return (
    verticalOverlap >= minimumHeight * 0.45 &&
    Math.abs(horizontalGap) <= referenceHeight * 0.15
  );
}

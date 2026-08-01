export const VISUAL_GUIDE_BANDS = ["A", "B", "C", "D"] as const;
export const VISUAL_GUIDE_BAND_COUNT = VISUAL_GUIDE_BANDS.length;

export type VisualGuideBand = (typeof VISUAL_GUIDE_BANDS)[number];

export type VisualGuideRegion = {
  start_band: VisualGuideBand;
  end_band: VisualGuideBand;
};

export type VisualGuideBounds = {
  y: number;
  height: number;
};

const visualGuideBandSet = new Set<string>(VISUAL_GUIDE_BANDS);

export function isVisualGuideBand(value: unknown): value is VisualGuideBand {
  return typeof value === "string" && visualGuideBandSet.has(value);
}

export function getVisualGuideBounds(
  region: VisualGuideRegion,
): VisualGuideBounds {
  const startIndex = VISUAL_GUIDE_BANDS.indexOf(region.start_band);
  const endIndex = VISUAL_GUIDE_BANDS.indexOf(region.end_band);
  const topBand = Math.min(startIndex, endIndex);
  const bottomBand = Math.max(startIndex, endIndex);

  return {
    y: topBand / VISUAL_GUIDE_BAND_COUNT,
    height: (bottomBand - topBand + 1) / VISUAL_GUIDE_BAND_COUNT,
  };
}

import type { PdfTextRegion } from "@/lib/pdf-text-regions";

export type Point = {
  x: number;
  y: number;
};

export type RegionPlacement = {
  baselineStart: Point;
  baselineVector: Point;
  heightVector: Point;
};

export type GroundingTextRegion = PdfTextRegion & {
  placement?: RegionPlacement;
};

export type TokenFragment = {
  regionIndex: number;
  startOffset: number;
  endOffset: number;
};

export type PdfToken = {
  value: string;
  pageIndex: number;
  fragments: TokenFragment[];
  synthetic?: boolean;
};

export type SourceToken = {
  value: string;
  sourceIndex: number;
  pageIndex: number;
};

export type SearchablePage = {
  pageIndex: number;
  regions: GroundingTextRegion[];
  tokens: PdfToken[];
};

export type TextToken = {
  value: string;
  startOffset: number;
  endOffset: number;
};

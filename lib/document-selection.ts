export type SelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentSelection = {
  page_index: number;
  bounds: SelectionBounds;
  text: string;
  image_url: string;
};

/** World layout in logical pixels (16:9). */
export const W = 1280;
export const H = 720;
export const LANE_Y = 360;
export const LANE_HALF = 52;
export const TILE = 40;
export const COLS = 6;
export const ROWS = 3;
export const CORE_X = [66, 1214];
export const CORE_R = 36;
export const BUILDING_R = 18;

export interface GridRect {
  x: number;
  y: number;
  cols: number;
  rows: number;
  w: number;
  h: number;
}

/** team 0 = left (blue), team 1 = right (red); slot 0 = above lane, slot 1 = below */
export function gridRect(team: number, slot: number): GridRect {
  const x = team === 0 ? 130 : 1150 - COLS * TILE;
  const y = slot === 0 ? LANE_Y - LANE_HALF - 20 - ROWS * TILE : LANE_Y + LANE_HALF + 20;
  return { x, y, cols: COLS, rows: ROWS, w: COLS * TILE, h: ROWS * TILE };
}

export function tileCenter(g: GridRect, col: number, row: number) {
  return { x: g.x + col * TILE + TILE / 2, y: g.y + row * TILE + TILE / 2 };
}

import { MAP_HEIGHT, MAP_WIDTH, TILE_COUNT } from "../types";

export function tileId(x: number, y: number): number {
  return y * MAP_WIDTH + x;
}

export function tileX(id: number): number {
  return id % MAP_WIDTH;
}

export function tileY(id: number): number {
  return Math.floor(id / MAP_WIDTH);
}

export function inBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

export function validTile(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < TILE_COUNT;
}

/** Four-directional neighbors, no wraparound. Writes into `out` and returns the count. */
export function neighbors4(id: number, out: Int32Array): number {
  const x = id % MAP_WIDTH;
  const y = (id - x) / MAP_WIDTH;
  let n = 0;
  if (y > 0) out[n++] = id - MAP_WIDTH;
  if (x < MAP_WIDTH - 1) out[n++] = id + 1;
  if (y < MAP_HEIGHT - 1) out[n++] = id + MAP_WIDTH;
  if (x > 0) out[n++] = id - 1;
  return n;
}

export function neighborList(id: number): number[] {
  const buf = new Int32Array(4);
  const n = neighbors4(id, buf);
  return Array.from(buf.subarray(0, n));
}

export function manhattan(a: number, b: number): number {
  return Math.abs(tileX(a) - tileX(b)) + Math.abs(tileY(a) - tileY(b));
}

/** Tiles within Manhattan radius (inclusive), in stable ascending id order. */
export function tilesWithin(center: number, radius: number): number[] {
  const cx = tileX(center);
  const cy = tileY(center);
  const out: number[] = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(MAP_HEIGHT - 1, cy + radius); y++) {
    const rem = radius - Math.abs(y - cy);
    for (let x = Math.max(0, cx - rem); x <= Math.min(MAP_WIDTH - 1, cx + rem); x++) {
      out.push(tileId(x, y));
    }
  }
  return out;
}

const COMPASS = ["northern", "north-eastern", "eastern", "south-eastern", "southern", "south-western", "western", "north-western"];

/** Human-readable direction of `to` relative to `from`, e.g. "northern". */
export function directionLabel(from: number, to: number): string {
  const dx = tileX(to) - tileX(from);
  const dy = tileY(to) - tileY(from);
  if (dx === 0 && dy === 0) return "central";
  const angle = Math.atan2(dx, -dy); // 0 = north, clockwise
  const idx = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS[idx] as string;
}

export function coordLabel(id: number): string {
  return `(${tileX(id)}, ${tileY(id)})`;
}

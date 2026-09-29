import { BALANCE } from "@/content/balance";
import { MAP_WIDTH, TILE_COUNT, Terrain, type TribeId } from "../types";
import { neighbors4 } from "./grid";

/**
 * Per-tile entry cost. 0 means impassable. Built once per turn per travel profile from terrain
 * and active travel modifiers; every consumer (candidates, engine, animations) uses the same field.
 */
export type CostField = Uint8Array;

export function baseTerrainCost(terrain: number, tribeId: TribeId | null): number {
  switch (terrain) {
    case Terrain.Meadow:
      return BALANCE.travel.meadow;
    case Terrain.Forest:
      return BALANCE.travel.forest;
    case Terrain.Mountain:
      return tribeId === "stonehaven" ? BALANCE.travel.stonehavenMountain : BALANCE.travel.mountain;
    default:
      return 0;
  }
}

export function buildCostField(terrain: Uint8Array, tribeId: TribeId | null, travelDelta?: Int8Array): CostField {
  const out = new Uint8Array(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    const base = baseTerrainCost(terrain[i] as number, tribeId);
    if (base === 0) continue;
    const d = travelDelta ? (travelDelta[i] as number) : 0;
    out[i] = Math.min(BALANCE.travel.maxCost, Math.max(BALANCE.travel.minCost, base + d));
  }
  return out;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys,
      v = this.vals;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const kp = k[p] as number,
        ki = k[i] as number;
      // tie-break on tile id for determinism
      if (kp < ki || (kp === ki && (v[p] as number) <= (v[i] as number))) break;
      [k[p], k[i]] = [ki, kp];
      [v[p], v[i]] = [v[i] as number, v[p] as number];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.keys,
      v = this.vals;
    const topK = k[0] as number,
      topV = v[0] as number;
    const lastK = k.pop() as number,
      lastV = v.pop() as number;
    if (k.length > 0) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < n && ((k[l] as number) < (k[m] as number) || ((k[l] as number) === (k[m] as number) && (v[l] as number) < (v[m] as number)))) m = l;
        if (r < n && ((k[r] as number) < (k[m] as number) || ((k[r] as number) === (k[m] as number) && (v[r] as number) < (v[m] as number)))) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i] as number, k[m] as number];
        [v[m], v[i]] = [v[i] as number, v[m] as number];
        i = m;
      }
    }
    return [topK, topV];
  }
}

export interface DistanceMap {
  sources: number[];
  maxCost: number;
  dist: Int32Array; // -1 unreachable
  prev: Int32Array;
  reached: number[]; // tiles in ascending (dist, id) order
}

/**
 * Weighted Dijkstra from `source` using entry costs. `blocked` tiles cannot be entered
 * (e.g. enemy settlement centers) unless they are in `allowTargets`.
 */
export function dijkstra(
  cost: CostField,
  source: number | number[],
  maxCost: number,
  blocked?: ReadonlySet<number>,
  allowTargets?: ReadonlySet<number>,
): DistanceMap {
  const dist = new Int32Array(TILE_COUNT).fill(-1);
  const prev = new Int32Array(TILE_COUNT).fill(-1);
  const done = new Uint8Array(TILE_COUNT);
  const reached: number[] = [];
  const heap = new MinHeap();
  const nb = new Int32Array(4);
  const sources = (Array.isArray(source) ? source : [source]).filter((s, i, a) => a.indexOf(s) === i).sort((a, b) => a - b);
  const sourceSet = new Set(sources);
  for (const s of sources) {
    dist[s] = 0;
    heap.push(0, s);
  }
  while (heap.size > 0) {
    const [d, u] = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    reached.push(u);
    // Targets that are otherwise blocked can be reached but not traversed through.
    if (!sourceSet.has(u) && blocked?.has(u)) continue;
    const n = neighbors4(u, nb);
    for (let i = 0; i < n; i++) {
      const w = nb[i] as number;
      const c = cost[w] as number;
      if (c === 0 || done[w]) continue;
      if (blocked?.has(w) && !allowTargets?.has(w)) continue;
      const nd = d + c;
      if (nd > maxCost) continue;
      const cur = dist[w] as number;
      if (cur === -1 || nd < cur || (nd === cur && u < (prev[w] as number))) {
        dist[w] = nd;
        prev[w] = u;
        heap.push(nd, w);
      }
    }
  }
  return { sources, maxCost, dist, prev, reached };
}

export function pathTo(map: DistanceMap, target: number): number[] {
  if ((map.dist[target] as number) < 0) return [];
  const path: number[] = [];
  let cur = target;
  let guard = 0;
  while (cur !== -1 && guard++ < 20000) {
    path.push(cur);
    cur = map.prev[cur] as number;
  }
  return path.reverse();
}

/** Connected land components (4-neighbour, non-water). Returns component id per tile (-1 water) and sizes. */
export function landComponents(terrain: Uint8Array): { comp: Int32Array; sizes: number[] } {
  const comp = new Int32Array(TILE_COUNT).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  const nb = new Int32Array(4);
  for (let i = 0; i < TILE_COUNT; i++) {
    if (terrain[i] === Terrain.Water || comp[i] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    comp[i] = id;
    stack.push(i);
    while (stack.length) {
      const u = stack.pop() as number;
      size++;
      const n = neighbors4(u, nb);
      for (let k = 0; k < n; k++) {
        const w = nb[k] as number;
        if (terrain[w] !== Terrain.Water && comp[w] === -1) {
          comp[w] = id;
          stack.push(w);
        }
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

export const WIDTH = MAP_WIDTH;

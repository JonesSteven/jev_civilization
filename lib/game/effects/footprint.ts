import type { FootprintSpec } from "@/content/events";
import { makeRng } from "../rng";
import { MAP_HEIGHT, MAP_WIDTH, Terrain, TERRAIN_NAMES, TILE_COUNT, type WorldState } from "../types";
import { directionLabel, neighbors4, tileId, tilesWithin } from "../world/grid";

export interface Footprint {
  tiles: number[] | null; // null = whole world
  label: string;
}

const MAP_CENTER = tileId(Math.floor(MAP_WIDTH / 2), Math.floor(MAP_HEIGHT / 2));

function areaLabel(center: number, noun: string): string {
  const dir = directionLabel(MAP_CENTER, center);
  return dir === "central" ? `the central ${noun}` : `the ${dir} ${noun}`;
}

function tilesOf(world: WorldState, terrain: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < TILE_COUNT; i++) if (world.terrain[i] === terrain) out.push(i);
  return out;
}

/**
 * Select an event's spatial footprint from seeded randomness only. Tribe identities, positions,
 * and the supported tribe are never consulted.
 */
export function selectFootprint(world: WorldState, spec: FootprintSpec, seed: string, turn: number, eventId: string): Footprint | null {
  const rng = makeRng(seed, "events", "footprint", turn, eventId);
  switch (spec.kind) {
    case "world":
      return { tiles: null, label: "the whole land" };
    case "region": {
      const land: number[] = [];
      for (let i = 0; i < TILE_COUNT; i++) if (world.terrain[i] !== Terrain.Water) land.push(i);
      const center = rng.pick(land);
      return { tiles: tilesWithin(center, spec.radius), label: areaLabel(center, "region") };
    }
    case "mountainArea": {
      const mountains = tilesOf(world, Terrain.Mountain);
      if (mountains.length === 0) return null;
      const center = rng.pick(mountains);
      return { tiles: tilesWithin(center, spec.radius), label: areaLabel(center, "highlands") };
    }
    case "riverBasin": {
      const water = tilesOf(world, Terrain.Water);
      if (water.length === 0) return null;
      const nb = new Int32Array(4);
      for (let attempt = 0; attempt < 6; attempt++) {
        const start = rng.pick(water);
        const sx = start % MAP_WIDTH,
          sy = Math.floor(start / MAP_WIDTH);
        const seen = new Set<number>([start]);
        const queue = [start];
        while (queue.length) {
          const u = queue.shift() as number;
          const n = neighbors4(u, nb);
          for (let k = 0; k < n; k++) {
            const w = nb[k] as number;
            if (seen.has(w) || world.terrain[w] !== Terrain.Water) continue;
            if (Math.abs((w % MAP_WIDTH) - sx) + Math.abs(Math.floor(w / MAP_WIDTH) - sy) > spec.radius) continue;
            seen.add(w);
            queue.push(w);
          }
        }
        if (seen.size < 15) continue;
        const all = new Set<number>(seen);
        for (const w of seen) for (const t of tilesWithin(w, 2)) all.add(t);
        return { tiles: [...all].sort((a, b) => a - b), label: areaLabel(start, "river basin") };
      }
      return null;
    }
    case "terrainPatch": {
      const terrainCode = TERRAIN_NAMES.indexOf(spec.terrain);
      const pool = tilesOf(world, terrainCode);
      if (pool.length === 0) return null;
      const nb = new Int32Array(4);
      for (let attempt = 0; attempt < 6; attempt++) {
        const start = rng.pick(pool);
        const seen = new Set<number>([start]);
        const queue = [start];
        while (queue.length && seen.size < spec.maxTiles) {
          const u = queue.shift() as number;
          const n = neighbors4(u, nb);
          for (let k = 0; k < n; k++) {
            const w = nb[k] as number;
            if (seen.has(w) || world.terrain[w] !== terrainCode) continue;
            seen.add(w);
            queue.push(w);
            if (seen.size >= spec.maxTiles) break;
          }
        }
        if (seen.size < 40) continue;
        // Include a one-tile border so edge settlements and sites are affected too.
        const all = new Set<number>(seen);
        for (const w of seen) for (const t of tilesWithin(w, 1)) all.add(t);
        return { tiles: [...all].sort((a, b) => a - b), label: areaLabel(start, spec.terrain === "forest" ? "forest" : spec.terrain) };
      }
      return null;
    }
  }
}

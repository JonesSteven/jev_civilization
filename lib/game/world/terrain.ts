import { BALANCE } from "@/content/balance";
import { makeRng } from "../rng";
import { MAP_HEIGHT, MAP_WIDTH, TILE_COUNT, Terrain, TILE_RESOURCES, type TileResource, type WorldState } from "../types";
import { neighbors4, tileId } from "./grid";
import { fbm } from "./noise";

export function createEmptyWorld(): WorldState {
  const stock = {} as Record<TileResource, Float32Array>;
  const cap = {} as Record<TileResource, Float32Array>;
  for (const r of TILE_RESOURCES) {
    stock[r] = new Float32Array(TILE_COUNT);
    cap[r] = new Float32Array(TILE_COUNT);
  }
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    terrain: new Uint8Array(TILE_COUNT),
    owner: new Int8Array(TILE_COUNT).fill(-1),
    fertility: new Uint8Array(TILE_COUNT),
    overlay: new Uint8Array(TILE_COUNT),
    stock,
    cap,
    assetAt: new Int32Array(TILE_COUNT).fill(-1),
    assets: [],
    nextAssetId: 1,
  };
}

function quantile(values: Float32Array, q: number): number {
  const sorted = Float32Array.from(values).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx] as number;
}

/**
 * Layered-noise terrain with cellular smoothing and river paths. Deterministic from (seed, attempt).
 */
export function generateTerrain(seed: string, attempt: number): { terrain: Uint8Array; elevation: Float32Array; moisture: Float32Array } {
  const rng = makeRng(seed, "map", "terrain", attempt);
  const saltE = rng.int(1, 1_000_000);
  const saltM = rng.int(1, 1_000_000);
  const saltR = rng.int(1, 1_000_000);
  const elevation = new Float32Array(TILE_COUNT);
  const moisture = new Float32Array(TILE_COUNT);
  const ox = rng.next() * 1000;
  const oy = rng.next() * 1000;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const i = tileId(x, y);
      // Gentle ridge noise gives mountains a range-like shape.
      const ridge = 1 - Math.abs(fbm((x + ox) / 38, (y + oy) / 38, saltR, 3) * 2 - 1);
      elevation[i] = fbm((x + ox) / 30, (y + oy) / 30, saltE, 5) * 0.75 + ridge * 0.25;
      moisture[i] = fbm((x + oy) / 22, (y + ox) / 22, saltM, 4);
    }
  }

  const lakeShare = BALANCE.map.waterShare * 0.7;
  const waterT = quantile(elevation, lakeShare);
  const mountainT = quantile(elevation, 1 - BALANCE.map.mountainShare);
  const forestT = quantile(moisture, 1 - BALANCE.map.forestShare);

  let terrain = new Uint8Array(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    const e = elevation[i] as number;
    if (e <= waterT) terrain[i] = Terrain.Water;
    else if (e >= mountainT) terrain[i] = Terrain.Mountain;
    else if ((moisture[i] as number) >= forestT) terrain[i] = Terrain.Forest;
    else terrain[i] = Terrain.Meadow;
  }

  // Cellular smoothing: majority of the 3×3 neighbourhood, two passes.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(terrain);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const counts = [0, 0, 0, 0];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
            const t = terrain[tileId(nx, ny)] as number;
            counts[t] = (counts[t] as number) + 1;
          }
        }
        let best = terrain[tileId(x, y)] as number;
        let bestCount = counts[best] as number;
        for (let t = 0; t < 4; t++) {
          if ((counts[t] as number) > bestCount + 1) {
            best = t;
            bestCount = counts[t] as number;
          }
        }
        next[tileId(x, y)] = best;
      }
    }
    terrain = next;
  }

  carveRivers(terrain, elevation, seed, attempt);
  return { terrain, elevation, moisture };
}

function carveRivers(terrain: Uint8Array, elevation: Float32Array, seed: string, attempt: number) {
  const rng = makeRng(seed, "map", "rivers", attempt);
  const nb = new Int32Array(4);
  // Candidate sources: land tiles next to mountains with high elevation.
  const sources: number[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    if (terrain[i] !== Terrain.Meadow && terrain[i] !== Terrain.Forest) continue;
    const n = neighbors4(i, nb);
    for (let k = 0; k < n; k++) {
      if (terrain[nb[k] as number] === Terrain.Mountain) {
        sources.push(i);
        break;
      }
    }
  }
  if (sources.length === 0) return;
  const chosen: number[] = [];
  for (let r = 0; r < BALANCE.map.riverCount * 4 && chosen.length < BALANCE.map.riverCount; r++) {
    const s = rng.pick(sources);
    // keep river sources apart
    if (chosen.every((c) => Math.abs((c % MAP_WIDTH) - (s % MAP_WIDTH)) + Math.abs(Math.floor(c / MAP_WIDTH) - Math.floor(s / MAP_WIDTH)) > 25)) {
      chosen.push(s);
    }
  }

  for (const source of chosen) {
    const visited = new Set<number>();
    const path: number[] = [];
    let cur = source;
    for (let step = 0; step < 260; step++) {
      path.push(cur);
      visited.add(cur);
      const n = neighbors4(cur, nb);
      let reachedWater = false;
      let best = -1;
      let bestScore = Infinity;
      for (let k = 0; k < n; k++) {
        const w = nb[k] as number;
        if (terrain[w] === Terrain.Water && !visited.has(w)) {
          reachedWater = true;
          break;
        }
        if (visited.has(w) || terrain[w] === Terrain.Mountain) continue;
        const score = (elevation[w] as number) + rng.next() * 0.02;
        if (score < bestScore) {
          bestScore = score;
          best = w;
        }
      }
      if (reachedWater || best === -1) break;
      const x = best % MAP_WIDTH;
      const y = Math.floor(best / MAP_WIDTH);
      if (x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1) {
        path.push(best);
        break;
      }
      cur = best;
    }
    if (path.length < 12) continue;
    // Leave fords at a fixed spacing so rivers never cut the land into separate components.
    const offset = rng.int(3, BALANCE.map.fordSpacing - 1);
    for (let i = 1; i < path.length; i++) {
      if ((i + offset) % BALANCE.map.fordSpacing === 0) {
        terrain[path[i] as number] = Terrain.Meadow;
        continue;
      }
      terrain[path[i] as number] = Terrain.Water;
    }
  }
}

/** Assign resource capacities, initial stocks, and fertility from terrain. */
export function fillResources(world: WorldState, seed: string, attempt: number, moisture?: Float32Array) {
  const R = BALANCE.resources;
  const rng = makeRng(seed, "map", "resources", attempt);
  const saltF = rng.int(1, 1_000_000);
  const nb = new Int32Array(4);
  for (let i = 0; i < TILE_COUNT; i++) {
    const t = world.terrain[i];
    const x = i % MAP_WIDTH;
    const y = Math.floor(i / MAP_WIDTH);
    const richness = 0.75 + fbm(x / 12, y / 12, saltF, 3) * 0.5; // 0.75..1.25
    const cap = world.cap;
    for (const r of TILE_RESOURCES) cap[r][i] = 0;
    world.fertility[i] = 0;
    if (t === Terrain.Water) {
      cap.fish[i] = R.fish.water * richness;
    } else if (t === Terrain.Meadow) {
      cap.forage[i] = R.forage.meadow * richness;
      cap.wildlife[i] = R.wildlife.meadow * richness;
      cap.timber[i] = R.timber.meadow;
      cap.stone[i] = R.stone.meadow;
      const m = moisture ? (moisture[i] as number) : 0.5;
      const f = R.fertility.meadowMin + (R.fertility.meadowMax - R.fertility.meadowMin) * Math.min(1, Math.max(0, (richness - 0.75) * 1.2 + m * 0.4));
      world.fertility[i] = Math.round(f);
    } else if (t === Terrain.Forest) {
      cap.forage[i] = R.forage.forest * richness;
      cap.wildlife[i] = R.wildlife.forest * richness;
      cap.timber[i] = R.timber.forest * richness;
      cap.stone[i] = R.stone.forest;
      world.fertility[i] = R.fertility.forestDefault;
    } else if (t === Terrain.Mountain) {
      cap.forage[i] = R.forage.mountain;
      cap.wildlife[i] = R.wildlife.mountain * richness;
      cap.timber[i] = R.timber.mountain;
      cap.stone[i] = R.stone.mountain * richness;
    }
    // Shore tiles next to water gain a little extra forage (reeds, shellfish).
    if (t !== Terrain.Water) {
      const n = neighbors4(i, nb);
      for (let k = 0; k < n; k++) {
        if (world.terrain[nb[k] as number] === Terrain.Water) {
          cap.forage[i] = (cap.forage[i] as number) + 0.5;
          break;
        }
      }
    }
    for (const r of TILE_RESOURCES) world.stock[r][i] = cap[r][i] as number;
  }
}

/** Recompute capacities for one tile after a permanent terrain conversion. Existing stocks are clamped. */
export function resetTileCapacities(world: WorldState, i: number) {
  const R = BALANCE.resources;
  const t = world.terrain[i];
  const cap = world.cap;
  const set = (r: TileResource, v: number) => {
    cap[r][i] = v;
    if ((world.stock[r][i] as number) > v) world.stock[r][i] = v;
  };
  if (t === Terrain.Meadow) {
    set("forage", R.forage.meadow);
    set("wildlife", R.wildlife.meadow);
    set("timber", R.timber.meadow);
    set("stone", R.stone.meadow);
    if ((world.fertility[i] as number) < R.fertility.meadowMin) world.fertility[i] = R.fertility.meadowMin;
  } else if (t === Terrain.Forest) {
    set("forage", R.forage.forest);
    set("wildlife", R.wildlife.forest);
    set("timber", R.timber.forest);
    set("stone", R.stone.forest);
    world.fertility[i] = R.fertility.forestDefault;
  } else if (t === Terrain.Mountain) {
    set("forage", R.forage.mountain);
    set("wildlife", R.wildlife.mountain);
    set("timber", R.timber.mountain);
    set("stone", R.stone.mountain);
    world.fertility[i] = 0;
  }
  set("fish", 0);
}

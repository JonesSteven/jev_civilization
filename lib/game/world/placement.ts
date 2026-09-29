import { BALANCE, STARTING } from "@/content/balance";
import { TRIBES } from "@/content/tribes";
import { makeRng } from "../rng";
import { Overlay, Terrain, TILE_COUNT, TRIBE_IDS, type TribeId, type WorldState } from "../types";
import { manhattan, tilesWithin } from "./grid";
import { buildCostField, dijkstra, landComponents, type DistanceMap } from "./pathfinding";
import { addAsset, isShore, siteTiles, sumStock, tribeIndex } from "./territory";

export type Settlements = Record<TribeId, number>;

/** Placement order is fixed and independent of the player's supported tribe. */
const PLACEMENT_ORDER: TribeId[] = ["stonehaven", "hearthwood", "windstep", "ironfang"];

function count(tiles: number[], pred: (t: number) => boolean): number {
  let n = 0;
  for (const t of tiles) if (pred(t)) n++;
  return n;
}

/** Cheap per-tile affinity filters used to build candidate lists. Exact validation happens after placement. */
function candidateTiles(world: WorldState, tribe: TribeId, comp: Int32Array, mainComp: number): number[] {
  const out: number[] = [];
  const T = world.terrain;
  for (let i = 0; i < TILE_COUNT; i++) {
    if (comp[i] !== mainComp) continue;
    const x = i % world.width;
    const y = Math.floor(i / world.width);
    if (x < 4 || y < 4 || x >= world.width - 4 || y >= world.height - 4) continue;
    const t = T[i];
    const r3 = tilesWithin(i, 3);
    switch (tribe) {
      case "hearthwood": {
        if (t !== Terrain.Meadow) continue;
        if (count(r3, (k) => T[k] === Terrain.Meadow) < 10) continue;
        if (count(tilesWithin(i, 6), (k) => T[k] === Terrain.Forest) < 6) continue;
        break;
      }
      case "windstep": {
        if (t !== Terrain.Meadow && t !== Terrain.Forest) continue;
        if (sumStock(world, r3, "wildlife") < 45) continue;
        break;
      }
      case "stonehaven": {
        if (t === Terrain.Water) continue;
        if (t !== Terrain.Mountain && count(tilesWithin(i, 1), (k) => T[k] === Terrain.Mountain) === 0) continue;
        if (count(r3, (k) => isShore(world, k)) < 3) continue;
        if (count(tilesWithin(i, 5), (k) => T[k] === Terrain.Water) < 12) continue;
        break;
      }
      case "ironfang": {
        if (t !== Terrain.Meadow && t !== Terrain.Forest) continue;
        break;
      }
    }
    out.push(i);
  }
  return out;
}

/**
 * Starting territory: up to 25 nearest contiguous land tiles per tribe (Dijkstra order from the settlement).
 * A tile wanted by two tribes goes to the nearer one; an exact tie leaves it unowned.
 */
export function claimStartTerritory(world: WorldState, settlements: Settlements): Record<TribeId, number[]> {
  const cost = buildCostField(world.terrain, null);
  const want = new Map<number, { tribe: TribeId; dist: number }[]>();
  for (const tribe of TRIBE_IDS) {
    const dm = dijkstra(cost, settlements[tribe], 12);
    const tiles = dm.reached.slice(0, BALANCE.placement.startTerritoryTiles);
    for (const t of tiles) {
      const list = want.get(t) ?? [];
      list.push({ tribe, dist: dm.dist[t] as number });
      want.set(t, list);
    }
  }
  const result = { hearthwood: [], windstep: [], stonehaven: [], ironfang: [] } as Record<TribeId, number[]>;
  for (const [tile, list] of want) {
    const settlementOwner = TRIBE_IDS.find((id) => settlements[id] === tile);
    let winner: TribeId | null = settlementOwner ?? null;
    if (!winner) {
      const best = Math.min(...list.map((l) => l.dist));
      const nearest = list.filter((l) => l.dist === best);
      winner = nearest.length === 1 ? (nearest[0] as { tribe: TribeId }).tribe : null;
    }
    if (winner) {
      world.owner[tile] = tribeIndex(winner);
      result[winner].push(tile);
    }
  }
  for (const id of TRIBE_IDS) result[id].sort((a, b) => a - b);
  return result;
}

function rankTiles(tiles: number[], score: (t: number) => number, center: number): number[] {
  return [...tiles].sort((a, b) => score(b) - score(a) || manhattan(a, center) - manhattan(b, center) || a - b);
}

/** Place starting sites and fixed shelter. Returns false when a tribe's start is not viable. */
export let lastAssetFailure = "";

export function placeStartingAssets(world: WorldState, settlements: Settlements, territory: Record<TribeId, number[]>): boolean {
  for (const tribe of TRIBE_IDS) {
    const center = settlements[tribe];
    const owned = territory[tribe].filter((t) => t !== center && world.assetAt[t] === -1);
    const profile = TRIBES[tribe];
    const sites = profile.startingSites;
    if (sites === "farm") {
      const meadows = rankTiles(owned.filter((t) => world.terrain[t] === Terrain.Meadow), (t) => world.fertility[t] as number, center);
      if (meadows.length < STARTING.startingSites + 1) return false;
      for (const t of meadows.slice(0, STARTING.startingSites)) addAsset(world, { kind: "farm", tile: t, owner: tribe, builtTurn: 0 });
    } else if (sites === "hunt") {
      const land = rankTiles(
        owned.filter((t) => world.terrain[t] === Terrain.Meadow || world.terrain[t] === Terrain.Forest),
        (t) => sumStock(world, siteTiles(world, t, "hunt"), "wildlife"),
        center,
      );
      const chosen: number[] = [];
      for (const t of land) {
        if (chosen.length >= STARTING.startingSites) break;
        if (chosen.some((c) => manhattan(c, t) < 3)) continue;
        chosen.push(t);
      }
      if (chosen.length < STARTING.startingSites) return false;
      for (const t of chosen) {
        if (sumStock(world, siteTiles(world, t, "hunt"), "wildlife") < 25) return false;
        addAsset(world, { kind: "hunt", tile: t, owner: tribe, builtTurn: 0 });
      }
    } else if (sites === "fishery") {
      const shores = rankTiles(
        owned.filter((t) => isShore(world, t)),
        (t) => sumStock(world, siteTiles(world, t, "fishery"), "fish"),
        center,
      );
      const chosen: number[] = [];
      for (const t of shores) {
        if (chosen.length >= STARTING.startingSites) break;
        if (chosen.some((c) => manhattan(c, t) < 2)) continue;
        chosen.push(t);
      }
      if (chosen.length < STARTING.startingSites) {
        lastAssetFailure = `${tribe}: only ${chosen.length} shore tiles`;
        return false;
      }
      for (const t of chosen) {
        if (sumStock(world, siteTiles(world, t, "fishery"), "fish") < 80) {
          lastAssetFailure = `${tribe}: fishery pool ${Math.floor(sumStock(world, siteTiles(world, t, "fishery"), "fish"))}`;
          return false;
        }
        addAsset(world, { kind: "fishery", tile: t, owner: tribe, builtTurn: 0 });
      }
    }

    const free = territory[tribe].filter((t) => t !== center && world.assetAt[t] === -1);
    if (profile.startingShelter === "wood") {
      const spot = rankTiles(free, () => 0, center)[0];
      if (spot === undefined) return false;
      addAsset(world, { kind: "housing", housingType: "wood", capacity: STARTING.housingCapacity, condition: 100, tile: spot, owner: tribe, builtTurn: 0 });
    } else if (profile.startingShelter === "cave") {
      const mountains = rankTiles(
        free.filter((t) => world.terrain[t] === Terrain.Mountain),
        () => 0,
        center,
      );
      const spot = mountains[0] ?? rankTiles(free, () => 0, center)[0];
      if (spot === undefined) return false;
      addAsset(world, { kind: "housing", housingType: "cave", capacity: STARTING.housingCapacity, condition: 100, tile: spot, owner: tribe, builtTurn: 0 });
      world.overlay[spot] = (world.overlay[spot] as number) | Overlay.Cave;
    }
  }
  return true;
}

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
}

/** Exact validation of a completed placement using weighted travel distances. */
export function validatePlacement(world: WorldState, settlements: Settlements): PlacementCheck {
  const standard = buildCostField(world.terrain, null);
  const maps = {} as Record<TribeId, DistanceMap>;
  for (const id of TRIBE_IDS) maps[id] = dijkstra(standard, settlements[id], 40);
  for (const a of TRIBE_IDS) {
    let hasNeighbor = false;
    for (const b of TRIBE_IDS) {
      if (a === b) continue;
      const d = maps[a].dist[settlements[b]] as number;
      if (d !== -1 && d < BALANCE.placement.minSeparation) return { ok: false, reason: `${a}-${b} too close` };
      if (d !== -1 && d <= BALANCE.placement.neighborWithin) hasNeighbor = true;
    }
    if (!hasNeighbor) return { ok: false, reason: `${a} has no neighbour within ${BALANCE.placement.neighborWithin}` };
  }
  // Ironfang uses its own travel profile to reach a raid target.
  const ironCost = buildCostField(world.terrain, "ironfang");
  const iron = dijkstra(ironCost, settlements.ironfang, BALANCE.placement.raidTargetWithin);
  const hasTarget = TRIBE_IDS.some((id) => id !== "ironfang" && (iron.dist[settlements[id]] as number) !== -1);
  if (!hasTarget) return { ok: false, reason: "ironfang has no raid target" };
  // Timber access for farmers and a mountain for Stonehaven.
  const hw = maps.hearthwood;
  let forest = 0;
  for (const t of hw.reached) if ((hw.dist[t] as number) <= BALANCE.territory.workingRange && world.terrain[t] === Terrain.Forest) forest++;
  if (forest < 4) return { ok: false, reason: "hearthwood lacks timber" };
  const sh = settlements.stonehaven;
  if (!tilesWithin(sh, 1).some((t) => world.terrain[t] === Terrain.Mountain)) return { ok: false, reason: "stonehaven lacks mountain" };
  return { ok: true };
}

/**
 * Attempt a seeded placement on `world`. Returns settlements or null. Does not mutate on failure
 * except through the caller's cloned world.
 */
export function trySettlementPlacement(
  world: WorldState,
  seed: string,
  mapAttempt: number,
  accept: (settlements: Settlements) => boolean = () => true,
): Settlements | null {
  const { comp, sizes } = landComponents(world.terrain);
  let mainComp = 0;
  for (let i = 1; i < sizes.length; i++) if ((sizes[i] as number) > (sizes[mainComp] as number)) mainComp = i;
  if (sizes.length === 0) return null;

  const lists = {} as Record<TribeId, number[]>;
  for (const id of TRIBE_IDS) {
    lists[id] = candidateTiles(world, id, comp, mainComp);
    if (lists[id].length === 0) return null;
  }
  const standard = buildCostField(world.terrain, null);

  for (let attempt = 0; attempt < BALANCE.map.maxPlacementAttemptsPerMap; attempt++) {
    const rng = makeRng(seed, "placement", mapAttempt, attempt);
    const placed = {} as Partial<Settlements>;
    const placedMaps: DistanceMap[] = [];
    let failed = false;
    for (const tribe of PLACEMENT_ORDER) {
      const list = lists[tribe];
      let chosen = -1;
      for (let tries = 0; tries < 30; tries++) {
        const t = rng.pick(list);
        let ok = true;
        let nearOne = placedMaps.length === 0;
        for (const dm of placedMaps) {
          const d = dm.dist[t] as number;
          if (d !== -1 && d < BALANCE.placement.minSeparation) ok = false;
          if (Object.values(placed).includes(t)) ok = false;
          if (d !== -1 && d <= BALANCE.placement.neighborWithin - 2) nearOne = true;
        }
        if (ok && nearOne) {
          chosen = t;
          break;
        }
      }
      if (chosen === -1) {
        failed = true;
        break;
      }
      placed[tribe] = chosen;
      placedMaps.push(dijkstra(standard, chosen, 40));
    }
    if (failed) continue;
    const settlements = placed as Settlements;
    if (validatePlacement(world, settlements).ok && accept(settlements)) return settlements;
  }
  return null;
}

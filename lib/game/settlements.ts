// Multiple settlements, scouting, and territory growth. All rules are deterministic and order-independent.

import { BALANCE, SCALE } from "@/content/balance";
import { foreignSettlements, livingTribes, reach, settlementsOf, type TribeGeo } from "./geo";
import { TERRAIN_NAMES, Terrain, TRIBE_IDS, type GameState, type ScoutedSite, type TribeId } from "./types";
import { manhattan, tilesWithin } from "./world/grid";
import { buildCostField, dijkstra } from "./world/pathfinding";
import { isLand, isShore, sumCap } from "./world/territory";

/** Tiles closer than the minimum separation (standard travel costs) to any living settlement. */
export function settlementBuffer(state: GameState): Uint8Array {
  const all = livingTribes(state).flatMap((id) => settlementsOf(state, id));
  const mask = new Uint8Array(state.world.terrain.length);
  if (all.length === 0) return mask;
  const dm = dijkstra(buildCostField(state.world.terrain, null), all, BALANCE.placement.minSeparation - 1);
  for (const t of dm.reached) mask[t] = 1;
  return mask;
}

export function siteSummary(state: GameState, tile: number) {
  const area = tilesWithin(tile, BALANCE.actions.scout.siteRadius);
  const w = state.world;
  let fert = 0;
  for (const t of area) if (w.terrain[t] === Terrain.Meadow && w.owner[t] === -1) fert += (w.fertility[t] as number) / 100;
  const free = area.filter((t) => w.owner[t] === -1);
  return {
    food: Math.round(sumCap(w, free, "forage") + sumCap(w, free, "wildlife") + fert * 6 * SCALE),
    fish: Math.round(sumCap(w, free, "fish")),
    timber: Math.round(sumCap(w, free, "timber")),
    stone: Math.round(sumCap(w, free, "stone")),
  };
}

function siteScore(s: { food: number; fish: number; timber: number; stone: number }): number {
  return s.food + s.fish * 0.5 + (s.timber + s.stone) * 0.12;
}

/** A site is usable for founding while it is unclaimed land, has no building, and is outside every settlement's buffer. */
export function siteUsable(state: GameState, tile: number, buffer: Uint8Array): boolean {
  const w = state.world;
  return isLand(w, tile) && w.owner[tile] === -1 && w.assetAt[tile] === -1 && buffer[tile] === 0;
}

/** Scouting survey: the best two usable sites within scout range of any own settlement, at least 10 tiles apart. */
export function surveySites(state: GameState, tribe: TribeId, geo: TribeGeo, turn: number): ScoutedSite[] {
  const buffer = settlementBuffer(state);
  const range = reach(geo, BALANCE.actions.scout.range);
  const candidates: { tile: number; score: number; summary: ReturnType<typeof siteSummary>; dist: number }[] = [];
  for (const t of geo.move.reached) {
    const d = geo.move.dist[t] as number;
    if (d > range || !siteUsable(state, t, buffer)) continue;
    // Sample every other tile for speed; the grid is fine enough that the best area is still found.
    if ((t % 2) + (Math.floor(t / state.world.width) % 2) !== 1 && d > 4) continue;
    const summary = siteSummary(state, t);
    candidates.push({ tile: t, score: siteScore(summary), summary, dist: d });
  }
  candidates.sort((a, b) => b.score - a.score || a.dist - b.dist || a.tile - b.tile);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= BALANCE.actions.scout.sitesFound) break;
    if (picked.some((p) => manhattan(p.tile, c.tile) < 10)) continue;
    picked.push(c);
  }
  return picked.map((p) => ({
    tile: p.tile,
    foundTurn: turn,
    food: p.summary.food,
    fish: p.summary.fish,
    timber: p.summary.timber,
    stone: p.summary.stone,
    terrain: TERRAIN_NAMES[state.world.terrain[p.tile] as number] as string,
    distance: p.dist,
  }));
}

/** Drop expired or no-longer-usable scouted sites. */
export function pruneScoutedSites(state: GameState, turn: number) {
  const buffer = settlementBuffer(state);
  for (const id of TRIBE_IDS) {
    const t = state.tribes[id];
    t.scoutedSites = t.alive ? t.scoutedSites.filter((s) => turn - s.foundTurn < BALANCE.actions.scout.expiresAfter && siteUsable(state, s.tile, buffer)) : [];
  }
}

/** Claim up to `n` nearest unclaimed land tiles around a new settlement (Dijkstra order, standard costs). */
export function claimAround(state: GameState, tribe: TribeId, center: number, n: number): number[] {
  const w = state.world;
  const idx = TRIBE_IDS.indexOf(tribe);
  const blocked = new Set(foreignSettlements(state, tribe));
  const dm = dijkstra(buildCostField(w.terrain, null), center, 12, blocked);
  const claimed: number[] = [];
  for (const t of dm.reached) {
    if (claimed.length >= n) break;
    if (t !== center && (w.owner[t] !== -1 || blocked.has(t))) continue;
    if (!isLand(w, t)) continue;
    w.owner[t] = idx;
    claimed.push(t);
  }
  return claimed;
}

/**
 * Organic border growth: every living tribe claims floor(population / growthPerTiles) unclaimed border tiles
 * in working range (capped), best food-and-material land first. A tile wanted by two tribes goes to nobody.
 */
export function organicGrowth(state: GameState, geo: Record<TribeId, TribeGeo>): Record<TribeId, number[]> {
  const T = BALANCE.territory;
  const w = state.world;
  const foreign = new Set(livingTribes(state).flatMap((id) => settlementsOf(state, id)));
  const wants = new Map<number, TribeId[]>();
  const result = {} as Record<TribeId, number[]>;
  for (const id of TRIBE_IDS) result[id] = [];
  for (const id of livingTribes(state)) {
    const g = geo[id];
    if (!g) continue;
    const n = Math.min(T.maxGrowthTilesPerTurn, Math.floor(state.tribes[id].population / T.growthPerTiles));
    if (n <= 0) continue;
    const idx = TRIBE_IDS.indexOf(id);
    const nb = [0, 0, 0, 0];
    const frontier: number[] = [];
    for (const t of g.work.reached) {
      if (w.owner[t] !== -1 || !isLand(w, t) || foreign.has(t)) continue;
      const x = t % w.width,
        y = Math.floor(t / w.width);
      nb[0] = y > 0 ? t - w.width : -1;
      nb[1] = x < w.width - 1 ? t + 1 : -1;
      nb[2] = y < w.height - 1 ? t + w.width : -1;
      nb[3] = x > 0 ? t - 1 : -1;
      if (nb.some((k) => k >= 0 && w.owner[k] === idx)) frontier.push(t);
    }
    const score = (t: number) =>
      (w.cap.forage[t] as number) + (w.cap.wildlife[t] as number) + (w.terrain[t] === Terrain.Meadow ? ((w.fertility[t] as number) / 25) * SCALE : 0) + (isShore(w, t) ? 3 * SCALE : 0) + ((w.cap.timber[t] as number) + (w.cap.stone[t] as number)) * 0.2;
    frontier.sort((a, b) => score(b) - score(a) || (g.work.dist[a] as number) - (g.work.dist[b] as number) || a - b);
    for (const t of frontier.slice(0, n)) wants.set(t, [...(wants.get(t) ?? []), id]);
  }
  for (const [tile, who] of wants) {
    if (who.length !== 1) continue;
    const id = who[0] as TribeId;
    w.owner[tile] = TRIBE_IDS.indexOf(id);
    result[id].push(tile);
  }
  for (const id of TRIBE_IDS) result[id].sort((a, b) => a - b);
  return result;
}

/** Up to `n` defender tiles that border the attacker's territory and hold no building (lowest tile ids first). */
export function capturableBorderTiles(state: GameState, attacker: TribeId, defender: TribeId, n: number): number[] {
  const w = state.world;
  const a = TRIBE_IDS.indexOf(attacker);
  const d = TRIBE_IDS.indexOf(defender);
  const protectedTiles = new Set(settlementsOf(state, defender));
  const out: number[] = [];
  for (let t = 0; t < w.owner.length && out.length < n; t++) {
    if (w.owner[t] !== d || w.assetAt[t] !== -1 || protectedTiles.has(t)) continue;
    const x = t % w.width,
      y = Math.floor(t / w.width);
    const touches =
      (y > 0 && w.owner[t - w.width] === a) ||
      (x < w.width - 1 && w.owner[t + 1] === a) ||
      (y < w.height - 1 && w.owner[t + w.width] === a) ||
      (x > 0 && w.owner[t - 1] === a);
    if (touches) out.push(t);
  }
  return out;
}

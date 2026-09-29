import { BALANCE } from "@/content/balance";
import { TRIBE_IDS, type GameState, type TribeId } from "./types";
import { buildCostField, dijkstra, type CostField, type DistanceMap } from "./world/pathfinding";

export interface TribeGeo {
  tribeId: TribeId;
  settlement: number;
  workingRange: number;
  movementBudget: number;
  /** Base-terrain distances within working range (production, shelter activity, scoring). */
  work: DistanceMap;
  /** Effective travel distances (weather and winter modifiers) up to max(movement budget, raid/recruit range). */
  move: DistanceMap;
  moveCost: CostField;
}

export function hasTech(state: GameState, tribe: TribeId, techId: string): boolean {
  return state.tribes[tribe].learned.includes(techId);
}

export function workingRange(state: GameState, tribe: TribeId): number {
  return hasTech(state, tribe, "logistics") ? BALANCE.territory.logisticsWorkingRange : BALANCE.territory.workingRange;
}

export function movementBudget(state: GameState, tribe: TribeId): number {
  const base = tribe === "windstep" ? BALANCE.movement.windstep : tribe === "ironfang" ? BALANCE.movement.ironfang : BALANCE.movement.base;
  return base + (hasTech(state, tribe, "logistics") ? BALANCE.movement.logisticsBonus : 0);
}

export function livingTribes(state: GameState): TribeId[] {
  return TRIBE_IDS.filter((id) => state.tribes[id].alive);
}

/** Geometry for every living tribe. Enemy settlement centers cannot be traversed but can be reached as raid targets. */
export function computeGeo(state: GameState, travelDelta: Int8Array): Record<TribeId, TribeGeo> {
  const out = {} as Record<TribeId, TribeGeo>;
  const living = livingTribes(state);
  const baseFields = new Map<string, CostField>();
  const moveFields = new Map<string, CostField>();
  const key = (id: TribeId) => (id === "stonehaven" ? "stonehaven" : "standard");
  for (const id of living) {
    const k = key(id);
    if (!baseFields.has(k)) baseFields.set(k, buildCostField(state.world.terrain, id));
    if (!moveFields.has(k)) moveFields.set(k, buildCostField(state.world.terrain, id, travelDelta));
    const others = new Set(living.filter((o) => o !== id).map((o) => state.tribes[o].settlement));
    const settlement = state.tribes[id].settlement;
    const range = workingRange(state, id);
    const budget = movementBudget(state, id);
    const moveMax = Math.max(budget, BALANCE.actions.raid.range, BALANCE.actions.recruit.range);
    const moveCost = moveFields.get(k) as CostField;
    out[id] = {
      tribeId: id,
      settlement,
      workingRange: range,
      movementBudget: budget,
      work: dijkstra(baseFields.get(k) as CostField, settlement, range, others),
      move: dijkstra(moveCost, settlement, moveMax, others, others),
      moveCost,
    };
  }
  return out;
}

export function inWorkingRange(geo: TribeGeo, tile: number): boolean {
  return (geo.work.dist[tile] as number) >= 0;
}

/** Tiles in working range that the tribe owns or that are unclaimed commons. */
export function accessibleTiles(state: GameState, geo: TribeGeo): number[] {
  const idx = TRIBE_IDS.indexOf(geo.tribeId);
  const out: number[] = [];
  for (const t of geo.work.reached) {
    const o = state.world.owner[t] as number;
    if (o === -1 || o === idx) out.push(t);
  }
  return out;
}

import { BALANCE } from "@/content/balance";
import { TRIBE_IDS, type GameState, type TribeId } from "./types";
import { buildCostField, dijkstra, type CostField, type DistanceMap } from "./world/pathfinding";

export interface TribeGeo {
  tribeId: TribeId;
  /** Capital tile. */
  settlement: number;
  /** Capital first, then outposts. */
  settlements: number[];
  workingRange: number;
  movementBudget: number;
  /** Base-terrain distances from the nearest own settlement, within working range (production, shelter, scoring). */
  work: DistanceMap;
  /** Base-terrain travel distances from the nearest own settlement, up to the longest possible raid/recruit/scout reach. */
  move: DistanceMap;
  /** Multiplier on raid, recruit, and scouting reach from travel conditions at the capital (weather, winter). */
  reachFactor: number;
  /** Effective travel distances from the capital only, up to the movement budget (relocation). */
  capitalMove: DistanceMap;
  moveCost: CostField;
}

export function settlementsOf(state: GameState, tribe: TribeId): number[] {
  const t = state.tribes[tribe];
  return [t.settlement, ...t.outposts];
}

/** Every settlement tile of every living tribe except `except`. */
export function foreignSettlements(state: GameState, except: TribeId | null): number[] {
  return livingTribes(state)
    .filter((o) => o !== except)
    .flatMap((o) => settlementsOf(state, o));
}

export function hasTech(state: GameState, tribe: TribeId, techId: string): boolean {
  return state.tribes[tribe].learned.includes(techId);
}

/** Reach grows with population (bigger communities work more distant land); Logistics adds a flat bonus. */
export function workingRange(state: GameState, tribe: TribeId): number {
  const T = BALANCE.territory;
  const grown = Math.min(T.maxWorkingRange, T.workingRange + Math.floor(state.tribes[tribe].population / T.rangePerPopulation));
  return grown + (hasTech(state, tribe, "logistics") ? T.logisticsRangeBonus : 0);
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
    const others = new Set(foreignSettlements(state, id));
    const settlement = state.tribes[id].settlement;
    const settlements = settlementsOf(state, id);
    const range = workingRange(state, id);
    const budget = movementBudget(state, id);
    const A = BALANCE.actions;
    const Tr = BALANCE.travel;
    const moveMax = Math.ceil(Math.max(A.raid.range, A.recruit.range, A.scout.range) * Tr.reachMax);
    const moveCost = moveFields.get(k) as CostField;
    const penalty = travelDelta[settlement] as number;
    const reachFactor = Math.min(Tr.reachMax, Math.max(Tr.reachMin, 1 - Tr.reachStepPerPenalty * penalty));
    out[id] = {
      tribeId: id,
      settlement,
      settlements,
      workingRange: range,
      movementBudget: budget,
      work: dijkstra(baseFields.get(k) as CostField, settlements, range, others),
      move: dijkstra(baseFields.get(k) as CostField, settlements, moveMax, others, others),
      reachFactor,
      capitalMove: dijkstra(moveCost, settlement, budget, others),
      moveCost,
    };
  }
  return out;
}

/** Effective reach for raids, recruiting, or scouting after travel conditions. */
export function reach(geo: TribeGeo, baseRange: number): number {
  return Math.floor(baseRange * geo.reachFactor);
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

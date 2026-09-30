// Plain-language forecast of which tribes an environmental option is likely to help or hurt. A rough reading
// of each effect against each tribe's way of life (farms, hunting sites, fisheries, housing, land, disease
// resistance) and whether its settlements lie inside the event's area. Shown to the player; never used by the engine.

import { BALANCE, SCALE } from "@/content/balance";
import type { EventOptionDef } from "@/content/events";
import { seasonOf } from "./calendar";
import { ModifierIndex } from "./effects/modifiers";
import { computeGeo } from "./geo";
import { shelterOutlook } from "./stats";
import { Terrain, TILE_COUNT, TRIBE_IDS, type EffectOp, type GameState, type TribeId } from "./types";

export interface OptionImpact {
  helps: TribeId[];
  hurts: TribeId[];
}

/** Per-tribe facts the forecast needs beyond the raw state (computed once per event card). */
export interface ImpactContext {
  /** Share of each tribe's people without shelter (cold only kills the unsheltered). */
  unsheltered: Partial<Record<TribeId, number>>;
}

interface TribeProfileNow {
  farms: number;
  hunts: number;
  fisheries: number;
  wood: number;
  stone: number;
  camp: boolean;
  irrigation: boolean;
  unsheltered: number;
  /** Claimed land tiles by terrain. */
  meadow: number;
  forest: number;
  mountain: number;
  lowTimber: boolean;
  lowStone: boolean;
}

/** Unsheltered shares for the living tribes, using the same geometry as the next turn. */
export function impactContext(state: GameState): ImpactContext {
  const mods = new ModifierIndex(state, state.activeEffects);
  const geo = computeGeo(state, mods.travelDelta(seasonOf(Math.min(state.completedTurn + 1, state.totalTurns))));
  const unsheltered: Partial<Record<TribeId, number>> = {};
  for (const id of TRIBE_IDS) {
    const g = geo[id];
    const t = state.tribes[id];
    if (!g || !t.alive || t.population <= 0) continue;
    unsheltered[id] = shelterOutlook(state, id, g).unsheltered / t.population;
  }
  return { unsheltered };
}

function profile(state: GameState, id: TribeId, unsheltered: number): TribeProfileNow {
  const t = state.tribes[id];
  const p: TribeProfileNow = {
    farms: 0,
    hunts: 0,
    fisheries: 0,
    wood: 0,
    stone: 0,
    camp: !!t.camp,
    irrigation: t.learned.includes("irrigation"),
    unsheltered,
    meadow: 0,
    forest: 0,
    mountain: 0,
    lowTimber: t.timber < 30 * SCALE,
    lowStone: t.stone < 30 * SCALE,
  };
  for (const a of state.world.assets) {
    if (a.owner !== id) continue;
    if (a.kind === "farm") p.farms++;
    else if (a.kind === "hunt") p.hunts++;
    else if (a.kind === "fishery") p.fisheries++;
    else if (a.kind === "housing" && a.housingType === "wood") p.wood++;
    else if (a.kind === "housing") p.stone++;
  }
  const idx = TRIBE_IDS.indexOf(id);
  for (let i = 0; i < TILE_COUNT; i++) {
    if (state.world.owner[i] !== idx) continue;
    const ter = state.world.terrain[i];
    if (ter === Terrain.Meadow) p.meadow++;
    else if (ter === Terrain.Forest) p.forest++;
    else if (ter === Terrain.Mountain) p.mountain++;
  }
  return p;
}

/** Share of a tribe's food sites of a given channel (0–1). */
function reliance(p: TribeProfileNow, channel: string): number {
  const total = p.farms + p.hunts + p.fisheries;
  // Every tribe forages passively and gathers food on most turns.
  if (channel === "forage") return 0.45;
  if (total === 0) return 0;
  if (channel === "farm") return p.farms / total;
  if (channel === "hunt") return p.hunts / total;
  if (channel === "fish") return p.fisheries / total;
  return 0;
}

const RESOURCE_CHANNEL: Record<string, string> = { forage: "forage", wildlife: "hunt", fish: "fish" };

/** How much a tribe cares about a building material right now. */
function materialNeed(p: TribeProfileNow, resource: string): number {
  if (resource === "timber") return p.lowTimber ? 0.6 : 0.15;
  if (resource === "stone") return p.lowStone ? 0.4 : 0.1;
  return 0;
}

/** Signed effect score for one tribe: positive helps, negative hurts. */
function scoreOp(op: EffectOp, id: TribeId, p: TribeProfileNow): number {
  const dur = (d: number) => Math.min(3, d);
  switch (op.op) {
    case "yieldMult":
      if (op.channel === "timber" || op.channel === "stone") return Math.log(op.factor) * materialNeed(p, op.channel) * dur(op.duration);
      return Math.log(op.factor) * reliance(p, op.channel) * dur(op.duration);
    case "dryFarm":
      return Math.log(p.irrigation ? Math.max(op.factor, BALANCE.production.irrigationDryFloor) : op.factor) * reliance(p, "farm") * dur(op.duration);
    case "regen": {
      const ch = RESOURCE_CHANNEL[op.resource];
      if (!ch) return Math.log(op.factor) * materialNeed(p, op.resource) * 0.3 * dur(op.duration);
      return Math.log(op.factor) * reliance(p, ch) * 0.5 * dur(op.duration);
    }
    case "stockAdjust": {
      const ch = RESOURCE_CHANNEL[op.resource];
      if (!ch) return op.fraction * materialNeed(p, op.resource) * (op.resource === "timber" && p.forest < 5 ? 0.2 : 1);
      return op.fraction * reliance(p, ch);
    }
    case "capacityAdjust": {
      const ch = RESOURCE_CHANNEL[op.resource];
      return ch ? op.fraction * reliance(p, ch) : op.fraction * materialNeed(p, op.resource) * 0.5;
    }
    case "exposure":
      // Storm damage can unhouse people too, so assume a small share is always exposed.
      return -op.add * 8 * Math.max(p.unsheltered, 0.05) * (id === "windstep" && p.camp ? BALANCE.tribeMods.windstep.campExposure : 1) * dur(op.duration);
    case "spoilage":
      return -op.add * 3 * dur(op.duration);
    case "shelterDamage":
    case "recurringShelterDamage": {
      const types = op.types ?? ["wood", "stone", "cave", "camp"];
      let exposed = 0;
      if (types.includes("camp") && p.camp) exposed += 1;
      if (types.includes("wood") && p.wood > 0) exposed += id === "hearthwood" ? 0.5 : 1;
      if ((types.includes("stone") || types.includes("cave")) && p.stone > 0) exposed += 0.3;
      return (-op.amount / 40) * Math.min(1, exposed) * (op.op === "recurringShelterDamage" ? dur(op.duration) : 1);
    }
    case "fertility":
      return (op.delta / 40) * reliance(p, "farm");
    case "convertTile": {
      // Forest → meadow opens farmland and costs hunters game; meadow → forest does the reverse.
      const toMeadow = op.to === "meadow" ? 1 : -1;
      const land = op.from === "forest" ? p.forest : p.meadow;
      if (land < 3) return 0;
      return (op.fraction / 0.15) * 0.3 * toMeadow * (reliance(p, "farm") - reliance(p, "hunt"));
    }
    case "overlay": {
      if (op.flag === "Cave") return p.mountain >= 3 ? 0.2 + p.unsheltered : 0;
      if (op.flag === "Sheltered") return p.forest >= 3 ? 0.15 + p.unsheltered : 0;
      if (op.flag === "Wheat") return 0.1 * reliance(p, "farm");
      if (op.flag === "Fruit") return 0.05;
      return 0;
    }
    case "settlementStock":
      return op.resource === "food" ? 0.2 : materialNeed(p, op.resource) * 0.5 + 0.1;
    case "travelMod":
      // Mobile tribes live by movement and raiding reach.
      return id === "windstep" || id === "ironfang" ? -op.delta * 0.05 * dur(op.duration) : 0;
    case "epidemic":
      return -op.fraction * 4 * BALANCE.diseaseResistance[id];
    case "delayed":
      return op.effects.reduce((s, e) => s + scoreOp(e, id, p) * 0.5, 0);
    default:
      return 0;
  }
}

/** Forecast scores below this size read as "little direct effect". */
export const IMPACT_THRESHOLD = 0.15;

/** Tribes an option is likely to help or hurt noticeably, given where the event strikes. */
export function optionImpact(state: GameState, option: EventOptionDef, footprint: number[] | null, ctx: ImpactContext = { unsheltered: {} }): OptionImpact {
  const helps: TribeId[] = [];
  const hurts: TribeId[] = [];
  const area = footprint ? new Set(footprint) : null;
  for (const id of TRIBE_IDS) {
    const t = state.tribes[id];
    if (!t.alive) continue;
    const inside = !area || [t.settlement, ...t.outposts].some((x) => area.has(x));
    if (!inside) continue;
    const p = profile(state, id, ctx.unsheltered[id] ?? 0);
    let score = 0;
    for (const op of option.effects) score += scoreOp(op, id, p);
    if (score >= IMPACT_THRESHOLD) helps.push(id);
    else if (score <= -IMPACT_THRESHOLD) hurts.push(id);
  }
  return { helps, hurts };
}

/** Living tribes with a settlement inside the area (all living tribes for a world-wide event). */
export function tribesInArea(state: GameState, footprint: number[] | null): TribeId[] {
  const area = footprint ? new Set(footprint) : null;
  return TRIBE_IDS.filter((id) => state.tribes[id].alive && (!area || [state.tribes[id].settlement, ...state.tribes[id].outposts].some((x) => area.has(x))));
}

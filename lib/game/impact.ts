// Plain-language forecast of which tribes an environmental option is likely to help or hurt. A rough reading
// of each effect against each tribe's way of life (farms, hunting sites, fisheries, housing, disease resistance)
// and whether its settlements lie inside the event's area. Shown to the player; never used by the engine.

import { BALANCE } from "@/content/balance";
import type { EventOptionDef } from "@/content/events";
import { TRIBE_IDS, type EffectOp, type GameState, type TribeId } from "./types";

export interface OptionImpact {
  helps: TribeId[];
  hurts: TribeId[];
}

interface TribeProfileNow {
  farms: number;
  hunts: number;
  fisheries: number;
  wood: number;
  stone: number;
  camp: boolean;
  irrigation: boolean;
  /** Share of people without shelter (cold only kills the unsheltered). */
  unsheltered: number;
}

function profile(state: GameState, id: TribeId, unsheltered: number): TribeProfileNow {
  const p: TribeProfileNow = { farms: 0, hunts: 0, fisheries: 0, wood: 0, stone: 0, camp: !!state.tribes[id].camp, irrigation: state.tribes[id].learned.includes("irrigation"), unsheltered };
  for (const a of state.world.assets) {
    if (a.owner !== id) continue;
    if (a.kind === "farm") p.farms++;
    else if (a.kind === "hunt") p.hunts++;
    else if (a.kind === "fishery") p.fisheries++;
    else if (a.kind === "housing" && a.housingType === "wood") p.wood++;
    else if (a.kind === "housing") p.stone++;
  }
  return p;
}

/** Share of a tribe's food sites of a given channel (0–1). */
function reliance(p: TribeProfileNow, channel: string): number {
  const total = p.farms + p.hunts + p.fisheries;
  if (channel === "forage") return 0.3;
  if (total === 0) return 0;
  if (channel === "farm") return p.farms / total;
  if (channel === "hunt") return p.hunts / total;
  if (channel === "fish") return p.fisheries / total;
  return 0;
}

const RESOURCE_CHANNEL: Record<string, string> = { forage: "forage", wildlife: "hunt", fish: "fish" };

/** Signed effect score for one tribe: positive helps, negative hurts. */
function scoreOp(op: EffectOp, id: TribeId, p: TribeProfileNow): number {
  const dur = (d: number) => Math.min(3, d);
  switch (op.op) {
    case "yieldMult":
      return Math.log(op.factor) * reliance(p, op.channel) * dur(op.duration);
    case "dryFarm":
      return Math.log(p.irrigation ? Math.max(op.factor, BALANCE.production.irrigationDryFloor) : op.factor) * reliance(p, "farm") * dur(op.duration);
    case "regen": {
      const ch = RESOURCE_CHANNEL[op.resource];
      return ch ? Math.log(op.factor) * reliance(p, ch) * 0.5 * dur(op.duration) : 0;
    }
    case "stockAdjust": {
      const ch = RESOURCE_CHANNEL[op.resource];
      return ch ? op.fraction * reliance(p, ch) : 0;
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
    case "epidemic":
      return -op.fraction * 4 * BALANCE.diseaseResistance[id];
    case "settlementStock":
      return 0.05;
    case "delayed":
      return op.effects.reduce((s, e) => s + scoreOp(e, id, p) * 0.5, 0);
    default:
      return 0;
  }
}

/**
 * Tribes an option is likely to help or hurt noticeably, given where the event strikes. `unsheltered` gives each
 * tribe's share of people without shelter (defaults to none).
 */
export function optionImpact(state: GameState, option: EventOptionDef, footprint: number[] | null, unsheltered: Partial<Record<TribeId, number>> = {}): OptionImpact {
  const helps: TribeId[] = [];
  const hurts: TribeId[] = [];
  const area = footprint ? new Set(footprint) : null;
  for (const id of TRIBE_IDS) {
    const t = state.tribes[id];
    if (!t.alive) continue;
    const inside = !area || [t.settlement, ...t.outposts].some((x) => area.has(x));
    if (!inside) continue;
    const p = profile(state, id, unsheltered[id] ?? 0);
    let score = 0;
    for (const op of option.effects) {
      // World-scoped effects in a regional family still reach everyone; only this tribe's area matters here.
      score += scoreOp(op, id, p);
    }
    if (score >= 0.15) helps.push(id);
    else if (score <= -0.15) hurts.push(id);
  }
  return { helps, hurts };
}

/** Living tribes with a settlement inside the area (all living tribes for a world-wide event). */
export function tribesInArea(state: GameState, footprint: number[] | null): TribeId[] {
  const area = footprint ? new Set(footprint) : null;
  return TRIBE_IDS.filter((id) => state.tribes[id].alive && (!area || [state.tribes[id].settlement, ...state.tribes[id].outposts].some((x) => area.has(x))));
}

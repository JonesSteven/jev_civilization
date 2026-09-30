import { BALANCE } from "@/content/balance";
import type { TribeGeo } from "./geo";
import { Overlay, TRIBE_IDS, type Asset, type GameState, type TribeId } from "./types";

export interface ShelterSummary {
  /** Condition-adjusted usable capacity from active housing, the camp, and natural shelter. */
  effective: number;
  raw: number;
  averageCondition: number;
  natural: number;
  dormantCapacity: number;
  assets: Asset[];
}

const NATURAL = BALANCE.housing.natural;

export function shelterSummary(state: GameState, tribe: TribeId, geo: TribeGeo | undefined): ShelterSummary {
  const t = state.tribes[tribe];
  let effective = 0,
    raw = 0,
    condWeighted = 0,
    dormant = 0;
  const assets: Asset[] = [];
  for (const a of state.world.assets) {
    if (a.owner !== tribe || a.kind !== "housing") continue;
    const cap = a.capacity ?? 0;
    const active = geo ? (geo.work.dist[a.tile] as number) >= 0 : true;
    if (!active) {
      dormant += cap;
      continue;
    }
    assets.push(a);
    raw += cap;
    condWeighted += cap * (a.condition ?? 100);
    effective += (cap * (a.condition ?? 100)) / 100;
  }
  if (t.camp && t.camp.capacity > 0) {
    raw += t.camp.capacity;
    condWeighted += t.camp.capacity * t.camp.condition;
    effective += (t.camp.capacity * t.camp.condition) / 100;
  }
  let natural = 0;
  if (geo) {
    const idx = TRIBE_IDS.indexOf(tribe);
    for (const tile of geo.work.reached) {
      if (state.world.owner[tile] !== idx) continue;
      const o = state.world.overlay[tile] as number;
      if (o & Overlay.Cave && state.world.assetAt[tile] === -1) natural += NATURAL.cave;
      else if (o & Overlay.Sheltered) natural += NATURAL.sheltered;
    }
    natural = Math.min(NATURAL.max, natural);
  }
  effective += natural;
  return {
    effective: Math.floor(effective),
    raw: raw + natural,
    averageCondition: raw > 0 ? Math.round(condWeighted / raw) : 100,
    natural,
    dormantCapacity: dormant,
    assets,
  };
}

export function shelterCoverage(state: GameState, tribe: TribeId, geo: TribeGeo | undefined): number {
  const pop = state.tribes[tribe].population;
  if (pop <= 0) return 0;
  return Math.min(1, shelterSummary(state, tribe, geo).effective / pop);
}

/** Weather damage multiplier by housing type (Hearthwood wooden homes take half). */
export function weatherDamageMultiplier(tribe: TribeId | null, type: "wood" | "stone" | "cave" | "camp"): number {
  const base = BALANCE.housing.weatherDamage[type];
  if (tribe === "hearthwood" && type === "wood") return base * BALANCE.tribeMods.hearthwood.woodWeatherDamage;
  return base;
}

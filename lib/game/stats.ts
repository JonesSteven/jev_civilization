import { BALANCE } from "@/content/balance";
import type { ModifierIndex } from "./effects/modifiers";
import { accessibleTiles, hasTech, type TribeGeo } from "./geo";
import { activeSiteCount, foragePotential, laborFactor, siteActive, siteDrawTiles, sitePotential } from "./production";
import { shelterSummary } from "./shelter";
import { Terrain, type GameState, type Season, type TribeId } from "./types";
import { assetAtTile, sumStock } from "./world/territory";

/** Fortification at a settlement tile (defaults to the capital). */
export function fortLevel(state: GameState, tribe: TribeId, tile: number = state.tribes[tribe].settlement): number {
  const a = assetAtTile(state.world, tile);
  return a && a.kind === "defenses" && a.owner === tribe ? (a.level ?? 0) : 0;
}

export function fortCap(state: GameState, tribe: TribeId): number {
  return hasTech(state, tribe, "fortification") ? BALANCE.actions.defenses.techCap : BALANCE.actions.defenses.baseCap;
}

export function terrainDefense(state: GameState, tribe: TribeId, tile: number = state.tribes[tribe].settlement): number {
  return state.world.terrain[tile] === Terrain.Mountain ? BALANCE.combat.mountainDefense : 1;
}

export function attackStrength(state: GameState, tribe: TribeId): number {
  const t = state.tribes[tribe];
  const raidMod = tribe === "ironfang" ? BALANCE.tribeMods.ironfang.raid : 1;
  return t.population * (1 + BALANCE.combat.militaryStep * t.militaryLevel) * raidMod;
}

export function defenseStrength(state: GameState, tribe: TribeId, defending: boolean, tile: number = state.tribes[tribe].settlement): number {
  const t = state.tribes[tribe];
  return (
    t.population *
    (1 + BALANCE.combat.militaryStep * t.militaryLevel) *
    (1 + BALANCE.combat.fortStep * fortLevel(state, tribe, tile)) *
    terrainDefense(state, tribe, tile) *
    (defending ? BALANCE.actions.defendMultiplier : 1)
  );
}

export function raidChance(attack: number, defense: number): number {
  const C = BALANCE.combat;
  if (attack + defense <= 0) return C.minChance;
  return Math.min(C.maxChance, Math.max(C.minChance, attack / (attack + defense)));
}

export interface FoodOutlook {
  /** Expected food income per turn from sites and forage this season, before availability limits on new demand. */
  expectedIncome: number;
  consumption: number;
  net: number;
  coverageTurns: number;
  status: "critically low" | "low" | "adequate" | "plentiful";
}

export function foodStatus(coverageTurns: number): FoodOutlook["status"] {
  if (coverageTurns < 1) return "critically low";
  if (coverageTurns < 2) return "low";
  if (coverageTurns < 4) return "adequate";
  return "plentiful";
}

/** Engine-computed outlook so Jev never needs to calculate coverage. Availability is approximated by current stocks. */
export function foodOutlook(state: GameState, tribe: TribeId, geo: TribeGeo, mods: ModifierIndex, season: Season): FoodOutlook {
  const t = state.tribes[tribe];
  let income = 0;
  const labor = laborFactor(state, tribe, activeSiteCount(state, tribe, geo));
  for (const a of state.world.assets) {
    if (a.owner !== tribe || !siteActive(state, tribe, a, geo)) continue;
    const p = sitePotential(state, tribe, a, season, mods) * labor;
    if (a.kind === "farm") income += p;
    else income += Math.min(p, sumStock(state.world, siteDrawTiles(state, tribe, a), a.kind === "fishery" ? "fish" : "wildlife"));
  }
  const access = accessibleTiles(state, geo);
  income += Math.min(foragePotential(state, tribe, season, mods, t.settlement), sumStock(state.world, access, "forage"));
  const consumption = t.population;
  const coverage = t.population > 0 ? t.food / t.population : 0;
  return {
    expectedIncome: Math.floor(income),
    consumption,
    net: Math.floor(income) - consumption,
    coverageTurns: Math.round(coverage * 10) / 10,
    status: foodStatus(coverage),
  };
}

export function shelterOutlook(state: GameState, tribe: TribeId, geo: TribeGeo) {
  const s = shelterSummary(state, tribe, geo);
  const pop = state.tribes[tribe].population;
  const coverage = pop > 0 ? Math.min(1, s.effective / pop) : 0;
  return {
    usableCapacity: s.effective,
    rawCapacity: s.raw,
    averageCondition: s.averageCondition,
    naturalShelter: s.natural,
    dormantCapacity: s.dormantCapacity,
    coverage: Math.round(coverage * 100) / 100,
    spare: Math.max(0, s.effective - pop),
    unsheltered: Math.max(0, pop - s.effective),
  };
}

export function moraleLabel(m: number): string {
  if (m < 25) return "despairing";
  if (m < 50) return "low";
  if (m < 75) return "steady";
  return "high";
}

import { BALANCE } from "@/content/balance";
import { TRIBES } from "@/content/tribes";
import { seasonOf } from "./calendar";
import type { ModifierIndex } from "./effects/modifiers";
import { hasTech, inWorkingRange, type TribeGeo } from "./geo";
import { TRIBE_IDS, type Asset, type GameState, type Season, type TribeId } from "./types";
import { siteTiles } from "./world/territory";

export interface Capabilities {
  farming: boolean;
  hunting: boolean;
  fishing: boolean;
  forage: boolean;
  stoneBuilding: boolean;
  foodGathering: boolean;
}

export function capabilities(state: GameState, tribe: TribeId): Capabilities {
  const innate = TRIBES[tribe].innate;
  const ag = hasTech(state, tribe, "agriculture");
  const fi = hasTech(state, tribe, "fishing");
  // Every tribe, raiders included, can forage and gather wild food from the start.
  const foodUnlock = true;
  return {
    farming: innate.includes("farming") || ag,
    hunting: innate.includes("hunting"),
    fishing: innate.includes("fishing") || fi,
    forage: innate.includes("forage") || tribe === "ironfang",
    stoneBuilding: innate.includes("stoneConstruction") || hasTech(state, tribe, "masonry"),
    foodGathering: foodUnlock,
  };
}

/** Draw radius of a tribe's hunting sites or fisheries (Windstep's trackers range farther). */
export function siteRadius(tribe: TribeId, kind: "hunt" | "fishery"): number {
  const r = BALANCE.territory.siteRadius;
  return tribe === "windstep" && kind === "hunt" ? r + BALANCE.tribeMods.windstep.huntRadiusBonus : r;
}

/** Tiles a hunting site or fishery draws from: within its radius, not claimed by another tribe. */
export function siteDrawTiles(state: GameState, tribe: TribeId, asset: Asset): number[] {
  const idx = TRIBE_IDS.indexOf(tribe);
  const kind = asset.kind === "fishery" ? "fishery" : "hunt";
  return siteTiles(state.world, asset.tile, kind, siteRadius(tribe, kind)).filter((t) => {
    const o = state.world.owner[t] as number;
    return o === -1 || o === idx;
  });
}

/** Potential (pre-availability) food from one site this turn: base × season × tribe × technology × environment. */
export function sitePotential(state: GameState, tribe: TribeId, asset: Asset, season: Season, mods: ModifierIndex): number {
  const P = BALANCE.production;
  const irrigation = hasTech(state, tribe, "irrigation");
  if (asset.kind === "farm") {
    let v = P.farm * ((state.world.fertility[asset.tile] as number) / 100) * P.season.farm[season];
    if (tribe === "hearthwood") v *= BALANCE.tribeMods.hearthwood.farm;
    if (hasTech(state, tribe, "agriculture")) v *= BALANCE.tech.agricultureFarm;
    return v * mods.yieldMultiplier("farm", asset.tile, irrigation);
  }
  if (asset.kind === "hunt") {
    let v = P.hunt * P.season.hunt[season];
    if (tribe === "windstep") v *= BALANCE.tribeMods.windstep.hunt;
    return v * mods.yieldMultiplier("hunt", asset.tile, false);
  }
  if (asset.kind === "fishery") {
    let v = P.fishery * P.season.fish[season];
    if (tribe === "stonehaven") v *= BALANCE.tribeMods.stonehaven.fish;
    if (hasTech(state, tribe, "fishing")) v *= BALANCE.tech.fishingFishery;
    return v * mods.yieldMultiplier("fish", asset.tile, false);
  }
  return 0;
}

/** A site produces only if its tribe still has the capability and the site is within working range. */
export function siteActive(state: GameState, tribe: TribeId, asset: Asset, geo: TribeGeo): boolean {
  if (asset.owner !== tribe || !inWorkingRange(geo, asset.tile)) return false;
  const caps = capabilities(state, tribe);
  if (asset.kind === "farm") return caps.farming;
  if (asset.kind === "hunt") return caps.hunting;
  if (asset.kind === "fishery") return caps.fishing;
  return false;
}

/** Share of full output every food site achieves given available workers (1 = fully staffed). */
export function laborFactor(state: GameState, tribe: TribeId, activeSites: number): number {
  if (activeSites <= 0) return 1;
  return Math.min(1, state.tribes[tribe].population / (activeSites * BALANCE.production.workersPerSite));
}

export function activeSiteCount(state: GameState, tribe: TribeId, geo: TribeGeo): number {
  let n = 0;
  for (const a of state.world.assets) if ((a.kind === "farm" || a.kind === "hunt" || a.kind === "fishery") && siteActive(state, tribe, a, geo)) n++;
  return n;
}

/** Shelter one housing action adds: its base capacity, or a share of the population for a large tribe. */
export function housingCapacity(kind: "wood" | "stone" | "camp", population: number): number {
  const A = BALANCE.actions;
  const base = kind === "wood" ? A.woodHousing.capacity : kind === "stone" ? A.stoneHousing.capacity : A.campHousing.capacity;
  return Math.max(base, Math.round((population * A.housingShare[kind]) / 10) * 10);
}

export function gatherPotential(state: GameState, tribe: TribeId, kind: "food" | "timber" | "stone", mods: ModifierIndex, settlementTile: number): number {
  const A = BALANCE.actions;
  const tools = hasTech(state, tribe, "tools") ? BALANCE.tech.toolsGather : 1;
  const pop = state.tribes[tribe].population;
  if (kind === "food") {
    let v = Math.max(A.gatherFood, pop * A.gatherFoodPerPerson);
    if (tribe === "windstep") v *= BALANCE.tribeMods.windstep.gatherFood;
    return v * mods.yieldMultiplier("forage", settlementTile, false);
  }
  if (kind === "timber") {
    let v = Math.max(A.gatherTimber, pop * A.gatherTimberPerPerson) * tools;
    if (tribe === "hearthwood") v *= BALANCE.tribeMods.hearthwood.timber;
    return v * mods.yieldMultiplier("timber", settlementTile, false);
  }
  let v = Math.max(A.quarryStone, pop * A.quarryStonePerPerson) * tools;
  if (tribe === "stonehaven") v *= BALANCE.tribeMods.stonehaven.stone;
  return v * mods.yieldMultiplier("stone", settlementTile, false);
}

export function foragePotential(state: GameState, tribe: TribeId, season: Season, mods: ModifierIndex, settlementTile: number): number {
  if (!capabilities(state, tribe).forage) return 0;
  const P = BALANCE.production;
  const base = Math.max(P.forage, state.tribes[tribe].population * P.foragePerPerson);
  return base * P.season.forage[season] * mods.yieldMultiplier("forage", settlementTile, false);
}

export function currentSeason(state: GameState): Season {
  return seasonOf(state.completedTurn + 1);
}

import { BALANCE } from "@/content/balance";
import { narrate } from "@/content/narration";
import { tribeName } from "@/content/tribes";
import type { ModifierIndex } from "./effects/modifiers";
import { accessibleTiles, hasTech, type TribeGeo } from "./geo";
import { remember } from "./memory";
import { activeSiteCount, foragePotential, laborFactor, siteActive, siteDrawTiles, sitePotential } from "./production";
import { allocate, type Demand } from "./resolve/allocation";
import { draw } from "./rng";
import { shelterSummary } from "./shelter";
import { Overlay, TILE_COUNT, TILE_RESOURCES, TRIBE_IDS, type GameOutcome, type GameState, type Season, type TribeId } from "./types";

export interface ProductionReport {
  farm: number;
  hunt: number;
  fish: number;
  forage: number;
  timber: number;
  stone: number;
  foodTotal: number;
  consumed: number;
  starvation: number;
  exposure: number;
  births: number;
  spoiled: number;
}

export function emptyReport(): ProductionReport {
  return { farm: 0, hunt: 0, fish: 0, forage: 0, timber: 0, stone: 0, foodTotal: 0, consumed: 0, starvation: 0, exposure: 0, births: 0, spoiled: 0 };
}

/** Renewable stocks regrow toward capacity by a biome regeneration fraction, scaled by active regen modifiers. */
export function regenerate(state: GameState, mods: ModifierIndex) {
  const R = BALANCE.resources;
  const rates = { forage: R.forage.regen, wildlife: R.wildlife.regen, fish: R.fish.regen, timber: R.timber.regen, stone: R.stone.regen };
  for (const res of TILE_RESOURCES) {
    const stock = state.world.stock[res];
    const cap = state.world.cap[res];
    const base = rates[res];
    for (let t = 0; t < TILE_COUNT; t++) {
      const c = cap[t] as number;
      if (c <= 0) continue;
      const s = stock[t] as number;
      if (s >= c) continue;
      const rate = Math.min(1, base * mods.regenMultiplier(res, t));
      stock[t] = Math.min(c, s + (c - s) * rate);
      if (res === "timber") {
        const thin = (stock[t] as number) < c * 0.35;
        state.world.overlay[t] = thin ? (state.world.overlay[t] as number) | Overlay.Thinned : (state.world.overlay[t] as number) & ~Overlay.Thinned;
      }
    }
  }
}

/**
 * Step 8 economy for all living tribes, simultaneously: regenerate, extract via proportional allocation,
 * produce, consume, starvation, exposure, births, spoilage, morale.
 */
export function runEconomy(
  state: GameState,
  geo: Record<TribeId, TribeGeo>,
  mods: ModifierIndex,
  season: Season,
  turn: number,
  outcomes: GameOutcome[],
): Record<TribeId, ProductionReport> {
  regenerate(state, mods);
  const living = TRIBE_IDS.filter((id) => state.tribes[id].alive);
  const reports = {} as Record<TribeId, ProductionReport>;
  for (const id of TRIBE_IDS) reports[id] = emptyReport();

  // --- Extraction demands (all computed before any stock is reduced) ---
  const wildlifeDemands: Demand[] = [];
  const fishDemands: Demand[] = [];
  const forageDemands: Demand[] = [];
  const timberDemands: Demand[] = [];
  const stoneDemands: Demand[] = [];
  const siteKind = new Map<string, { tribe: TribeId; kind: "hunt" | "fish" }>();

  for (const id of living) {
    const g = geo[id];
    const t = state.tribes[id];
    const labor = laborFactor(state, id, activeSiteCount(state, id, g));
    for (const a of state.world.assets) {
      if (a.owner !== id || !siteActive(state, id, a, g)) continue;
      if (a.kind === "farm") {
        const v = sitePotential(state, id, a, season, mods) * labor;
        reports[id].farm += v;
      } else if (a.kind === "hunt" || a.kind === "fishery") {
        const key = `${id}:site:${a.id}`;
        const d: Demand = { key, amount: sitePotential(state, id, a, season, mods) * labor, tiles: siteDrawTiles(state, id, a) };
        if (a.kind === "hunt") wildlifeDemands.push(d);
        else fishDemands.push(d);
        siteKind.set(key, { tribe: id, kind: a.kind === "hunt" ? "hunt" : "fish" });
      }
    }
    const access = accessibleTiles(state, g);
    const forage = foragePotential(state, id, season, mods, t.settlement);
    if (forage > 0) forageDemands.push({ key: `${id}:forage`, amount: forage, tiles: access });
    timberDemands.push({ key: `${id}:routine`, amount: BALANCE.production.routineTimber, tiles: access });
    stoneDemands.push({ key: `${id}:routine`, amount: BALANCE.production.routineStone, tiles: access });
  }

  const w = state.world;
  for (const [key, got] of allocate(w.stock.wildlife, wildlifeDemands)) reports[siteKind.get(key)!.tribe].hunt += got;
  for (const [key, got] of allocate(w.stock.fish, fishDemands)) reports[siteKind.get(key)!.tribe].fish += got;
  for (const [key, got] of allocate(w.stock.forage, forageDemands)) reports[key.split(":")[0] as TribeId].forage += got;
  for (const [key, got] of allocate(w.stock.timber, timberDemands)) reports[key.split(":")[0] as TribeId].timber += got;
  for (const [key, got] of allocate(w.stock.stone, stoneDemands)) reports[key.split(":")[0] as TribeId].stone += got;

  for (const id of living) {
    const t = state.tribes[id];
    const r = reports[id];
    // Round each tribe's final yield down once, after all modifiers.
    r.foodTotal = Math.floor(r.farm + r.hunt + r.fish + r.forage);
    t.food += r.foodTotal;
    t.timber += Math.floor(r.timber);
    t.stone += Math.floor(r.stone);
  }

  // --- Consumption, starvation, exposure, births ---
  for (const id of living) {
    const t = state.tribes[id];
    const r = reports[id];
    const requirement = t.population;
    const consumed = Math.min(t.food, requirement);
    t.food -= consumed;
    r.consumed = consumed;
    const deficitRatio = requirement > 0 ? (requirement - consumed) / requirement : 0;
    const starvation = Math.min(t.population, Math.ceil(t.population * deficitRatio * BALANCE.population.starvationRate));
    t.population -= starvation;
    r.starvation = starvation;
    t.lastFoodDeficit = deficitRatio > 0;

    const shelter = shelterSummary(state, id, geo[id]);
    const unsheltered = Math.max(0, t.population - shelter.effective);
    let severity = (season === "winter" ? BALANCE.population.winterExposure : 0) + mods.exposureAdd(t.settlement);
    severity = Math.max(0, severity);
    if (id === "windstep" && t.camp) severity *= BALANCE.tribeMods.windstep.campExposure;
    const expected = unsheltered * severity;
    // Stochastic rounding with a keyed draw keeps the expected loss exact without a minimum of one.
    const whole = Math.floor(expected);
    const extra = draw(state.seed, "effects", "exposure", turn, id) < expected - whole ? 1 : 0;
    const exposure = Math.min(t.population, whole + extra);
    t.population -= exposure;
    r.exposure = exposure;
    t.lastExposureLoss = exposure;

    let births = 0;
    if (deficitRatio === 0 && shelter.effective > t.population && t.morale >= BALANCE.population.birthMinMorale && t.population > 0) {
      const P = BALANCE.population;
      const wellFed = t.food >= t.population * P.wellFedTurns;
      t.birthAccumulator += t.population * (P.birthRate + (wellFed ? P.wellFedBirthBonus : 0));
      const whole = Math.floor(t.birthAccumulator);
      births = Math.min(whole, shelter.effective - t.population);
      t.birthAccumulator -= whole;
      t.population += births;
    }
    r.births = births;

    const baseSpoil = hasTech(state, id, "food_storage") ? BALANCE.population.storageSpoilage : BALANCE.population.spoilage;
    const spoilRate = Math.min(0.15, Math.max(0, baseSpoil + mods.spoilageAdd(t.settlement)));
    const spoiled = Math.floor(t.food * spoilRate);
    t.food -= spoiled;
    r.spoiled = spoiled;

    const M = BALANCE.morale;
    let dm = 0;
    if (deficitRatio > 0) dm += M.foodDeficit;
    if (exposure > 0) dm += M.exposureLoss;
    if (deficitRatio === 0 && t.population > 0 && t.food >= t.population * 2) dm += M.wellFed;
    t.morale = Math.max(M.min, Math.min(M.max, t.morale + dm));

    const name = tribeName(id);
    if (starvation > 0) {
      outcomes.push({ kind: "starvation", tribeId: id, text: narrate("starvation", { tribe: name, count: starvation }), amounts: { population: -starvation } });
      remember(state, id, turn, "shortage", `Food shortage on turn ${turn}; ${starvation} people died of hunger`);
    }
    if (exposure > 0) {
      outcomes.push({ kind: "exposure", tribeId: id, text: narrate("exposure", { tribe: name, count: exposure }), amounts: { population: -exposure } });
      remember(state, id, turn, "exposure", `Lost ${exposure} people to cold exposure on turn ${turn}`);
    }
    if (births > 0) outcomes.push({ kind: "births", tribeId: id, text: narrate("births", { tribe: name, count: births }), amounts: { population: births } });
  }
  return reports;
}

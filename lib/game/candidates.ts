// Legal action candidates, generated from the common pre-action snapshot using the same pathfinding,
// ownership, and cost rules the engine resolves with. Target selection rules are fixed and documented in
// content/actions.ts (targetRule). Jev only ever picks one of these IDs; it never invents targets.

import { ACTIONS } from "@/content/actions";
import { BALANCE, SCALE } from "@/content/balance";
import { EVENT_BY_ID } from "@/content/events";
import { TECHNOLOGIES, TECH_BY_ID } from "@/content/technologies";
import { TRIBES, tribeName } from "@/content/tribes";
import { seasonOf } from "./calendar";
import { ModifierIndex } from "./effects/modifiers";
import { accessibleTiles, computeGeo, foreignSettlements, livingTribes, reach, settlementsOf, type TribeGeo } from "./geo";
import { settlementBuffer, siteUsable } from "./settlements";
import { acceptableOffers, hasOpenOffer, unionEligible } from "./unions";
import { activeSiteCount, capabilities, gatherPotential, laborFactor, sitePotential, siteRadius } from "./production";
import { attackStrength, defenseStrength, fortCap, fortLevel, foodOutlook, raidChance, researchEffort, shelterOutlook } from "./stats";
import {
  TERRAIN_NAMES,
  Terrain,
  TRIBE_IDS,
  type ActionCandidate,
  type ActionKind,
  type Asset,
  type GameState,
  type ResourceAmounts,
  type Season,
  type TribeId,
} from "./types";
import { directionLabel, manhattan, tilesWithin } from "./world/grid";
import { buildCostField, dijkstra, pathTo } from "./world/pathfinding";
import { assetAtTile, isLand, isShore, siteTiles, sumCap, sumStock } from "./world/territory";

export interface AnnouncedEvent {
  eventId: string;
  optionId: string;
  title: string;
  optionLabel: string;
  description: string;
  footprint: number[] | null;
  footprintLabel: string;
}

export interface Snapshot {
  state: GameState;
  turn: number;
  season: Season;
  geo: Record<TribeId, TribeGeo>;
  mods: ModifierIndex;
  announced: AnnouncedEvent;
}

export function buildSnapshot(state: GameState, optionId: string): Snapshot {
  const prepared = state.currentEvent;
  if (!prepared) throw new Error("no prepared event");
  const turn = state.completedTurn + 1;
  const season = seasonOf(turn);
  const mods = new ModifierIndex(state, state.activeEffects);
  const geo = computeGeo(state, mods.travelDelta(season));
  const event = EVENT_BY_ID[prepared.eventId];
  const option = event?.options.find((o) => o.id === optionId);
  if (!event || !option) throw new Error(`invalid option ${optionId} for ${prepared.eventId}`);
  return {
    state,
    turn,
    season,
    geo,
    mods,
    announced: {
      eventId: event.id,
      optionId: option.id,
      title: event.title,
      optionLabel: option.label,
      description: option.description,
      footprint: prepared.footprint,
      footprintLabel: prepared.footprintLabel,
    },
  };
}

const ZERO: ResourceAmounts = { food: 0, timber: 0, stone: 0 };

export function costText(c: ResourceAmounts): string {
  const parts: string[] = [];
  if (c.food) parts.push(`${c.food} food`);
  if (c.timber) parts.push(`${c.timber} timber`);
  if (c.stone) parts.push(`${c.stone} stone`);
  return parts.length ? `Spend ${parts.join(", ")}` : "No stock cost";
}

export function affordable(state: GameState, tribe: TribeId, c: ResourceAmounts): boolean {
  const t = state.tribes[tribe];
  return t.food >= c.food && t.timber >= c.timber && t.stone >= c.stone;
}

function terrainName(state: GameState, tile: number): string {
  return TERRAIN_NAMES[state.world.terrain[tile] as number] as string;
}

function placeLabel(snap: Snapshot, geo: TribeGeo, tile: number, map: "work" | "move" | "capital" = "work"): string {
  const d = (map === "capital" ? geo.capitalMove.dist[tile] : map === "move" ? geo.move.dist[tile] : geo.work.dist[tile]) as number;
  const dir = directionLabel(geo.settlement, tile);
  return `${dir} ${terrainName(snap.state, tile)} ${d} travel units away`;
}

function announcedNote(snap: Snapshot, tile: number): string | null {
  const a = snap.announced;
  const covered = a.footprint === null || a.footprint.includes(tile);
  if (!covered) return null;
  return `This location is inside the announced ${a.title} (${a.optionLabel}) area: ${a.description}`;
}

function candidate(
  tribe: TribeId,
  id: string,
  kind: ActionKind,
  costs: ResourceAmounts,
  description: string,
  expectedEffects: string[],
  risks: string[] = [],
  target: ActionCandidate["target"] = null,
): ActionCandidate {
  return {
    id,
    kind,
    actorId: tribe,
    target,
    costs,
    usesResearchEffort: kind === "research_start" || kind === "research_continue",
    description,
    expectedEffects,
    risks,
  };
}

function rankTop<T>(items: T[], compare: (a: T, b: T) => number, n: number): T[] {
  return [...items].sort(compare).slice(0, n);
}

function tribeTileIndex(tribe: TribeId): number {
  return TRIBE_IDS.indexOf(tribe);
}

/** Free claimed land tiles in working range (no asset, not the settlement center). */
function freeOwnedTiles(snap: Snapshot, tribe: TribeId, geo: TribeGeo): number[] {
  const w = snap.state.world;
  const idx = tribeTileIndex(tribe);
  return geo.work.reached.filter((t) => w.owner[t] === idx && w.assetAt[t] === -1 && !geo.settlements.includes(t) && isLand(w, t));
}

function distCompare(geo: TribeGeo) {
  return (a: number, b: number) => (geo.work.dist[a] as number) - (geo.work.dist[b] as number) || a - b;
}

/** Up to two distinct targets: the best-scoring and the nearest. */
function bestAndNearest(tiles: number[], score: (t: number) => number, geo: TribeGeo): number[] {
  if (tiles.length === 0) return [];
  const nearest = rankTop(tiles, distCompare(geo), 1)[0] as number;
  const best = rankTop(tiles, (a, b) => score(b) - score(a) || distCompare(geo)(a, b), 1)[0] as number;
  return best === nearest ? [best] : [best, nearest];
}

function housingCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const A = BALANCE.actions;
  const caps = capabilities(snap.state, tribe);
  const free = freeOwnedTiles(snap, tribe, geo).sort(distCompare(geo));
  const spot = free[0];
  const sh = shelterOutlook(snap.state, tribe, geo);
  const pop = snap.state.tribes[tribe].population;
  const over = BALANCE.population.overcrowding;
  const shelterLine = `Current usable shelter ${sh.usableCapacity} for ${pop} people (${sh.unsheltered} unsheltered)`;
  /** What a housing option achieves: people protected from cold, and the higher birth limit. */
  const benefit = (cap: number) =>
    `Protects ${Math.min(cap, sh.unsheltered) > 0 ? `${Math.min(cap, sh.unsheltered)} of the unsheltered from winter cold and storms` : `${cap} future people`} and raises the birth limit from ${Math.floor(sh.usableCapacity * over)} to ${Math.floor((sh.usableCapacity + cap) * over)} people (births stop above ${over}× shelter).`;
  if (spot !== undefined) {
    if (affordable(snap.state, tribe, A.woodHousing.cost)) {
      const note = announcedNote(snap, spot);
      out.push(
        candidate(
          tribe,
          `housing_wood_at_${spot}`,
          "build_housing",
          A.woodHousing.cost,
          `${costText(A.woodHousing.cost)}; build wooden homes for ${A.woodHousing.capacity} people on the ${placeLabel(snap, geo, spot)}. ${benefit(A.woodHousing.capacity)} Fixed: stays if the settlement moves. ${shelterLine}.`,
          [`+${A.woodHousing.capacity} shelter capacity at full condition`],
          [tribe === "hearthwood" ? "Wooden homes take half weather damage for Hearthwood" : "Wooden homes take ordinary weather damage", ...(note ? [note] : [])],
          { type: "housing", housingType: "wood", tile: spot, label: placeLabel(snap, geo, spot) },
        ),
      );
    }
    if (caps.stoneBuilding && affordable(snap.state, tribe, A.stoneHousing.cost)) {
      out.push(
        candidate(
          tribe,
          `housing_stone_at_${spot}`,
          "build_housing",
          A.stoneHousing.cost,
          `${costText(A.stoneHousing.cost)}; build stone houses for ${A.stoneHousing.capacity} people on the ${placeLabel(snap, geo, spot)}. ${benefit(A.stoneHousing.capacity)} Durable against weather; stays if the settlement moves. ${shelterLine}.`,
          [`+${A.stoneHousing.capacity} shelter capacity`],
          ["Stone housing takes 40% of ordinary weather damage"],
          { type: "housing", housingType: "stone", tile: spot, label: placeLabel(snap, geo, spot) },
        ),
      );
    }
  }
  if (TRIBES[tribe].innate.includes("portableCamps") && affordable(snap.state, tribe, A.campHousing.cost)) {
    out.push(
      candidate(
        tribe,
        "housing_camp",
        "build_housing",
        A.campHousing.cost,
        `${costText(A.campHousing.cost)}; add portable camp shelter for ${A.campHousing.capacity} people that moves with the settlement. ${benefit(A.campHousing.capacity)} ${shelterLine}.`,
        [`+${A.campHousing.capacity} portable shelter capacity`],
        ["Camps take 130% of ordinary weather damage"],
        { type: "housing", housingType: "camp", tile: null, label: "portable camp" },
      ),
    );
  }
}

function repairCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const R = BALANCE.actions.repair;
  const t = snap.state.tribes[tribe];
  const caps = capabilities(snap.state, tribe);
  const damaged = snap.state.world.assets.filter(
    (a) => a.owner === tribe && a.kind === "housing" && (a.condition ?? 100) < 100 && (geo.work.dist[a.tile] as number) >= 0,
  );
  const options: { id: string; label: string; missing: number; material: "timber" | "stone"; asset: Asset | null }[] = [];
  for (const a of rankTop(damaged, (x, y) => (x.condition ?? 100) - (y.condition ?? 100) || x.id - y.id, 2)) {
    const material = a.housingType === "wood" ? "timber" : "stone";
    if (material === "stone" && !caps.stoneBuilding) continue;
    options.push({ id: `repair_${a.id}`, label: `${a.housingType} housing at the ${placeLabel(snap, geo, a.tile)}`, missing: 100 - (a.condition ?? 100), material, asset: a });
  }
  if (t.camp && t.camp.condition < 100) options.push({ id: "repair_camp", label: "the portable camp", missing: 100 - t.camp.condition, material: "timber", asset: null });
  for (const o of options) {
    const needed = Math.ceil(Math.min(o.missing, R.maxCondition) / (R.maxCondition / R.maxMaterial));
    const spend = Math.min(R.maxMaterial, needed, t[o.material]);
    if (spend < 1) continue;
    const restore = Math.min(o.missing, Math.floor((spend * R.maxCondition) / R.maxMaterial));
    const costs = { ...ZERO, [o.material]: spend };
    out.push(
      candidate(
        tribe,
        o.id,
        "repair_shelter",
        costs,
        `${costText(costs)}; restore ${restore} condition points to ${o.label} (currently ${100 - o.missing}%).`,
        [`+${restore} condition, raising usable shelter`],
        [],
        o.asset ? { type: "asset", assetId: o.asset.id, tile: o.asset.tile, label: o.label } : { type: "housing", housingType: "camp", tile: null, label: o.label },
      ),
    );
  }
}

function siteCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const A = BALANCE.actions;
  const caps = capabilities(snap.state, tribe);
  const w = snap.state.world;
  const free = freeOwnedTiles(snap, tribe, geo);
  const season = snap.season;
  const n = BALANCE.actions.maxTargetsPerLocationAction;
  const sites = activeSiteCount(snap.state, tribe, geo);
  const laborAfter = laborFactor(snap.state, tribe, sites + 1);
  const laborNote =
    laborAfter < 1
      ? ` Labor: ${snap.state.tribes[tribe].population} people can fully staff ${Math.floor(snap.state.tribes[tribe].population / BALANCE.production.workersPerSite)} sites; with ${sites + 1} sites every site runs at ${Math.round(laborAfter * 100)}%.`
      : "";
  const make = (kind: "farm" | "hunt" | "fishery", tiles: number[], cost: ResourceAmounts, label: string, action: ActionKind, detail: (t: number) => string) => {
    for (const tile of tiles.slice(0, n)) {
      const est = Math.floor(sitePotential(snap.state, tribe, { id: -1, kind, tile, owner: tribe, builtTurn: 0 }, season, snap.mods) * laborAfter);
      const note = announcedNote(snap, tile);
      out.push(
        candidate(
          tribe,
          `${kind}_at_${tile}`,
          action,
          cost,
          `${costText(cost)}; establish a ${label} on the ${placeLabel(snap, geo, tile)} (${detail(tile)}). Produces from this turn, about ${est} food per turn at this season's rates before resource limits.${laborNote}`,
          [`New ${label} producing about ${est} food per turn this season`],
          [...(kind !== "farm" ? ["Output is limited by nearby stocks, which other sites may share"] : []), ...(note ? [note] : [])],
          { type: "tile", tile, label: placeLabel(snap, geo, tile) },
        ),
      );
    }
  };
  if (caps.farming && affordable(snap.state, tribe, A.farmCost)) {
    const meadows = free.filter((t) => w.terrain[t] === Terrain.Meadow);
    make("farm", bestAndNearest(meadows, (t) => w.fertility[t] as number, geo), A.farmCost, "farm", "establish_farm", (t) => `fertility ${w.fertility[t]}%`);
  }
  if (caps.hunting && affordable(snap.state, tribe, A.huntCost)) {
    const land = free.filter((t) => w.terrain[t] === Terrain.Meadow || w.terrain[t] === Terrain.Forest);
    const score = (t: number) => sumStock(w, siteTiles(w, t, "hunt", siteRadius(tribe, "hunt")), "wildlife");
    make("hunt", bestAndNearest(land, score, geo), A.huntCost, "hunting site", "establish_hunt", (t) => `${Math.floor(score(t))} wildlife nearby`);
  }
  if (caps.fishing && affordable(snap.state, tribe, A.fisheryCost)) {
    const shores = free.filter((t) => isShore(w, t));
    const score = (t: number) => sumStock(w, siteTiles(w, t, "fishery"), "fish");
    make("fishery", bestAndNearest(shores, score, geo), A.fisheryCost, "fishery", "establish_fishery", (t) => `${Math.floor(score(t))} fish nearby`);
  }
}

function gatherCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const w = snap.state.world;
  const access = accessibleTiles(snap.state, geo);
  const t = snap.state.tribes[tribe];
  const caps = capabilities(snap.state, tribe);
  const unsheltered = shelterOutlook(snap.state, tribe, geo).unsheltered;
  if (caps.foodGathering) {
    const avail = Math.floor(sumStock(w, access, "forage") + sumStock(w, access, "wildlife"));
    const pot = Math.floor(gatherPotential(snap.state, tribe, "food", snap.mods, t.settlement));
    if (avail > 0) {
      out.push(
        candidate(
          tribe,
          "gather_food",
          "gather_food",
          ZERO,
          `No stock cost; collect up to ${pot} food from forage and wildlife within working range (${avail} currently available there). Existing sites keep producing. Current stores: ${t.food} food, covering ${t.population > 0 ? (t.food / t.population).toFixed(1) : "0"} turns of consumption.`,
          [`+${Math.min(pot, avail)} food (less if other tribes gather from the same unclaimed land)`],
          [
            "Reduces local forage and wildlife stocks",
            ...(unsheltered > 0 ? [`Does nothing for the ${unsheltered} people without shelter`] : []),
            ...(t.food >= t.population * 3 ? [`Stores already cover ${(t.food / t.population).toFixed(1)} turns of food`] : []),
          ],
        ),
      );
    }
  }
  const timberAvail = Math.floor(sumStock(w, access, "timber"));
  if (timberAvail > 0) {
    const pot = Math.floor(gatherPotential(snap.state, tribe, "timber", snap.mods, t.settlement));
    out.push(
      candidate(
        tribe,
        "gather_timber",
        "gather_timber",
        ZERO,
        `No stock cost; cut up to ${pot} timber from reachable forests (${timberAvail} available in working range). Stores hold ${t.timber} timber; wooden homes for ${BALANCE.actions.woodHousing.capacity} people cost ${BALANCE.actions.woodHousing.cost.timber}${unsheltered > 0 ? `, and ${unsheltered} people are unsheltered` : ""}.`,
        [`+${Math.min(pot, timberAvail)} timber${Math.min(pot, timberAvail) + t.timber >= BALANCE.actions.woodHousing.cost.timber ? " (enough to build housing next turn)" : ""}`],
        ["Thins nearby forest; timber regrows slowly"],
      ),
    );
  }
  const stoneAvail = Math.floor(sumStock(w, access, "stone"));
  if (stoneAvail > 0) {
    const pot = Math.floor(gatherPotential(snap.state, tribe, "stone", snap.mods, t.settlement));
    out.push(
      candidate(tribe, "quarry_stone", "quarry_stone", ZERO, `No stock cost; quarry up to ${pot} stone from reachable deposits (${stoneAvail} available in working range).`, [`+${Math.min(pot, stoneAvail)} stone`], ["Stone deposits barely regenerate"]),
    );
  }
}

function researchCandidates(snap: Snapshot, tribe: TribeId, out: ActionCandidate[]) {
  const t = snap.state.tribes[tribe];
  if (t.project) {
    const tech = TECH_BY_ID[t.project.techId];
    const name = tech?.name ?? t.project.techId;
    const effort = researchEffort(snap.state, tribe);
    const willComplete = t.project.progress + effort >= t.project.required;
    out.push(
      candidate(
        tribe,
        "research_continue",
        "research_continue",
        ZERO,
        `No stock cost; uses this turn's effort to advance ${name} by ${effort} (${t.project.progress}/${t.project.required} effort turns done; larger tribes research faster).${willComplete ? ` Completes ${name} this turn: ${tech?.effect ?? ""}` : ""}`,
        [willComplete ? `Learn ${name}` : `${name} progress ${t.project.progress + effort}/${t.project.required}`],
      ),
    );
    out.push(
      candidate(tribe, "research_cancel", "research_cancel", ZERO, `No refund; discard ${name} progress (${t.project.progress}/${t.project.required}) and use this turn's effort. Morale falls slightly.`, [`${name} progress lost`], ["The original research cost is not returned"]),
    );
    return;
  }
  const effort = researchEffort(snap.state, tribe);
  for (const tech of TECHNOLOGIES) {
    if (t.learned.includes(tech.id)) continue;
    if (!tech.prerequisites.every((p) => t.learned.includes(p))) continue;
    if (!affordable(snap.state, tribe, tech.cost)) continue;
    const completes = tech.effortTurns <= effort;
    out.push(
      candidate(
        tribe,
        `research_${tech.id}`,
        "research_start",
        tech.cost,
        `${costText(tech.cost)} once; start ${tech.name}, completing ${Math.min(effort, tech.effortTurns)} of ${tech.effortTurns} effort turns now (our ${t.population} people complete ${effort} per research turn; larger tribes research faster).${completes ? "" : " Later progress requires choosing Continue research."} ${tech.name}: ${tech.effect} Each learned technology adds ${(BALANCE.score.development.weight / BALANCE.score.development.techs).toFixed(1)} civilization-score points.`,
        [completes ? `Learn ${tech.name}` : `${tech.name} progress ${effort}/${tech.effortTurns}`],
        ["Other actions pause the project without losing progress"],
        { type: "tech", techId: tech.id, label: tech.name },
      ),
    );
  }
}

/** Relocation destinations: reachable within the movement budget on own/unclaimed land, no foreign or productive asset. */
function relocationCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const cost = BALANCE.actions.relocate.cost;
  if (!affordable(snap.state, tribe, cost)) return;
  const s = snap.state;
  const w = s.world;
  const idx = tribeTileIndex(tribe);
  const others = foreignSettlements(s, tribe);
  const dests = geo.capitalMove.reached.filter((tile) => {
    const d = geo.capitalMove.dist[tile] as number;
    if (geo.settlements.includes(tile) || d < 3 || d > geo.movementBudget) return false;
    if (!isLand(w, tile) || others.includes(tile)) return false;
    const o = w.owner[tile] as number;
    if (o !== -1 && o !== idx) return false;
    const a = assetAtTile(w, tile);
    if (a && !(a.kind === "defenses" && a.owner === tribe)) return false;
    return true;
  });
  if (dests.length === 0) return;
  const foodScore = (tile: number) => {
    const area = tilesWithin(tile, 4);
    let fert = 0;
    for (const t of area) if (w.terrain[t] === Terrain.Meadow) fert += (w.fertility[t] as number) / 100;
    return sumStock(w, area, "forage") + sumStock(w, area, "wildlife") + sumStock(w, area, "fish") * 0.5 + fert * 2 * SCALE;
  };
  const safety = (tile: number) => (others.length ? Math.min(...others.map((o) => manhattan(o, tile))) : 0);
  const byFood = rankTop(dests, (a, b) => foodScore(b) - foodScore(a) || (geo.capitalMove.dist[a] as number) - (geo.capitalMove.dist[b] as number) || a - b, 1)[0];
  const bySafety = rankTop(dests, (a, b) => safety(b) - safety(a) || foodScore(b) - foodScore(a) || a - b, 1)[0];
  const picks = [...new Set([byFood, bySafety].filter((x): x is number => x !== undefined))];
  const baseCost = buildCostField(w.terrain, tribe);
  const range = geo.workingRange;
  for (const dest of picks) {
    const newWork = dijkstra(baseCost, [dest, ...geo.settlements.slice(1)], range, new Set(others));
    const fixed = w.assets.filter((a) => a.owner === tribe && a.kind !== "defenses");
    const dormantAfter = fixed.filter((a) => (newWork.dist[a.tile] as number) < 0).length;
    const nowActive = fixed.filter((a) => (geo.work.dist[a.tile] as number) >= 0).length;
    const newFood = Math.floor(foodScore(dest));
    const reason = dest === byFood ? "most wild food within reach" : "farthest from other settlements";
    const path = pathTo(geo.capitalMove, dest);
    const note = announcedNote(snap, dest);
    out.push(
      candidate(
        tribe,
        `relocate_to_${dest}`,
        "relocate",
        cost,
        `${costText(cost)}; move the ${geo.settlements.length > 1 ? "capital" : "settlement"} to the ${placeLabel(snap, geo, dest, "capital")} (${reason}; about ${newFood} wild food stock nearby). Stores and portable camps travel with it; fixed buildings stay. ${dormantAfter} of ${fixed.length} fixed sites/housing would be outside working range (dormant) afterwards (${nowActive} active now).`,
        [`Settlement center moves ${geo.capitalMove.dist[dest]} travel units`, "Any raid aimed at the old location this turn finds nothing"],
        [...(dormantAfter > 0 ? [`${dormantAfter} fixed assets stop producing or sheltering until the tribe returns`] : []), ...(note ? [note] : [])],
        { type: "path", tile: dest, path, label: placeLabel(snap, geo, dest, "capital") },
      ),
    );
  }
}

/** Greedy frontier growth of up to eight unclaimed land tiles in working range, scored by food or by materials. */
export function expansionSet(snap: Snapshot, tribe: TribeId, geo: TribeGeo, score: (t: number) => number): number[] {
  const w = snap.state.world;
  const idx = tribeTileIndex(tribe);
  const others = new Set(foreignSettlements(snap.state, tribe));
  const eligible = (t: number) => isLand(w, t) && w.owner[t] === -1 && (geo.work.dist[t] as number) >= 0 && !others.has(t);
  const owned = new Set<number>();
  for (const t of geo.work.reached) if (w.owner[t] === idx) owned.add(t);
  const chosen: number[] = [];
  const chosenSet = new Set<number>();
  const nb = [0, 0, 0, 0];
  for (let k = 0; k < BALANCE.territory.expandTiles; k++) {
    let best = -1;
    let bestScore = -Infinity;
    const frontier = new Set<number>();
    for (const t of [...owned, ...chosenSet]) {
      const x = t % w.width,
        y = Math.floor(t / w.width);
      nb[0] = y > 0 ? t - w.width : -1;
      nb[1] = x < w.width - 1 ? t + 1 : -1;
      nb[2] = y < w.height - 1 ? t + w.width : -1;
      nb[3] = x > 0 ? t - 1 : -1;
      for (const n of nb) if (n >= 0 && !chosenSet.has(n) && eligible(n)) frontier.add(n);
    }
    for (const t of frontier) {
      const s = score(t);
      if (s > bestScore || (s === bestScore && t < best)) {
        best = t;
        bestScore = s;
      }
    }
    if (best === -1) break;
    chosen.push(best);
    chosenSet.add(best);
  }
  return chosen.sort((a, b) => a - b);
}

function expansionCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const cost = BALANCE.actions.expand.cost;
  if (!affordable(snap.state, tribe, cost)) return;
  const w = snap.state.world;
  const food = (t: number) => (w.cap.forage[t] as number) + (w.cap.wildlife[t] as number) + (w.terrain[t] === Terrain.Meadow ? ((w.fertility[t] as number) / 25) * SCALE : 0) + (isShore(w, t) ? 3 * SCALE : 0);
  const materials = (t: number) => (w.cap.timber[t] as number) + (w.cap.stone[t] as number);
  const foodSet = expansionSet(snap, tribe, geo, food);
  const matSet = expansionSet(snap, tribe, geo, materials);
  const describe = (tiles: number[]) => {
    const counts = [0, 0, 0, 0];
    for (const t of tiles) counts[w.terrain[t] as number] = (counts[w.terrain[t] as number] as number) + 1;
    const parts = [counts[1] ? `${counts[1]} meadow` : "", counts[2] ? `${counts[2]} forest` : "", counts[3] ? `${counts[3]} mountain` : ""].filter(Boolean);
    return parts.join(", ");
  };
  const seen = new Set<string>();
  for (const [kind, tiles] of [
    ["food", foodSet],
    ["materials", matSet],
  ] as const) {
    if (tiles.length === 0) continue;
    const key = tiles.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const center = tiles[Math.floor(tiles.length / 2)] as number;
    const summary =
      kind === "food"
        ? `${Math.floor(sumCap(w, tiles, "forage") + sumCap(w, tiles, "wildlife"))} wild food capacity`
        : `${Math.floor(sumCap(w, tiles, "timber"))} timber and ${Math.floor(sumCap(w, tiles, "stone"))} stone capacity`;
    out.push(
      candidate(
        tribe,
        `expand_${kind}`,
        "expand",
        cost,
        `${costText(cost)}; claim ${tiles.length} unclaimed border tiles toward the ${directionLabel(geo.settlement, center)} (${describe(tiles)}; ${summary}). Claimed tiles can host new sites and count toward influence.`,
        [`+${tiles.length} claimed tiles`],
        ["Tiles another tribe claims at the same time go to nobody"],
        { type: "tiles", tiles, label: `${tiles.length} tiles toward the ${directionLabel(geo.settlement, center)}` },
      ),
    );
  }
}

/** Nearest reachable settlement tile of `target` from any of our settlements, or null. */
function nearestSettlementOf(snap: Snapshot, geo: TribeGeo, target: TribeId, range: number): number | null {
  let best: number | null = null;
  for (const tile of settlementsOf(snap.state, target)) {
    const d = geo.move.dist[tile] as number;
    if (d < 0 || d > range) continue;
    if (best === null || d < (geo.move.dist[best] as number) || (d === (geo.move.dist[best] as number) && tile < best)) best = tile;
  }
  return best;
}

function settlementName(state: GameState, tribe: TribeId, tile: number): string {
  return tile === state.tribes[tribe].settlement ? `${tribeName(tribe)}'s ${state.tribes[tribe].outposts.length ? "capital" : "settlement"}` : `${tribeName(tribe)}'s outpost`;
}

function raidCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const R = BALANCE.actions.raid;
  const s = snap.state;
  const t = s.tribes[tribe];
  if (t.militaryLevel < R.minMilitary) return;
  // A desperate raid is always possible: it costs up to the listed food, or whatever remains in the stores.
  const raidCost = { ...R.cost, food: Math.min(R.cost.food, t.food) };
  const targets = livingTribes(s)
    .filter((o) => o !== tribe)
    .map((o) => ({ id: o, tile: nearestSettlementOf(snap, geo, o, reach(geo, R.range)) }))
    .filter((x): x is { id: TribeId; tile: number } => x.tile !== null);
  if (targets.length === 0) return;
  const atk = attackStrength(s, tribe);
  const weakest = rankTop(targets, (a, b) => defenseStrength(s, a.id, false, a.tile) - defenseStrength(s, b.id, false, b.tile) || (a.id < b.id ? -1 : 1), 1)[0]!;
  const nearest = rankTop(targets, (a, b) => (geo.move.dist[a.tile] as number) - (geo.move.dist[b.tile] as number) || (a.id < b.id ? -1 : 1), 1)[0]!;
  const L = BALANCE.combat.loot;
  const picks = weakest.id === nearest.id ? [weakest] : [weakest, nearest];
  for (const { id: target, tile } of picks) {
    const tt = s.tribes[target];
    const def = defenseStrength(s, target, false, tile);
    const defD = defenseStrength(s, target, true, tile);
    const chance = Math.round(raidChance(atk, def) * 100);
    const chanceD = Math.round(raidChance(atk, defD) * 100);
    const name = settlementName(s, target, tile);
    const isCapital = tile === tt.settlement;
    out.push(
      candidate(
        tribe,
        `raid_${target}`,
        "raid",
        raidCost,
        `${costText(raidCost)}; raid ${name} ${geo.move.dist[tile]} travel units away${geo.reachFactor < 1 ? ` (weather shortens raiding reach to ${reach(geo, R.range)} this turn)` : ""}. Game-engine success chance ${chance}% (attack ${Math.round(atk)} vs defense ${Math.round(def)}); ${chanceD}% if ${tribeName(target)} chooses Defend. Success takes up to ${L.food} food, ${L.timber} timber, and ${L.stone} stone from its stores (it holds ${tt.food} food, ${tt.timber} timber, ${tt.stone} stone), captures up to ${BALANCE.territory.raidCaptureTiles} of its border tiles that touch our territory, kills about ${Math.round(BALANCE.combat.successLoss.defender * 100)}% of its people, and costs about ${Math.round(BALANCE.combat.successLoss.attacker * 100)}% of ours; failure costs about ${Math.round(BALANCE.combat.failureLoss.attacker * 100)}% of ours.${conquestNote(s, tribe, target)}`,
        [`Success: loot up to ${Math.min(L.food, tt.food)} food and up to ${BALANCE.territory.raidCaptureTiles} border tiles`, "Relations with the target worsen"],
        [isCapital ? "If the target moves its capital this turn, the raid finds nothing (no loot, no casualties)" : "Outposts cannot relocate", "Several raids on one tribe share its loot"],
        { type: "settlement", tribeId: target, tile, label: name },
      ),
    );
  }
}

function conquestNote(s: GameState, tribe: TribeId, target: TribeId): string {
  const C = BALANCE.combat;
  const U = BALANCE.union;
  const pop = s.tribes[target].population;
  if (s.tribes[tribe].population < pop * C.conquestRatio) return "";
  const after = Math.floor(pop * (1 - C.successLoss.defender));
  if (after >= U.minPopulation) return "";
  return ` Because we are more than ${C.conquestRatio} times larger and ${tribeName(target)} would fall below ${U.minPopulation} people, a successful raid conquers it: its land, stores, and knowledge become ours and about ${Math.round(C.conquestJoinShare * 100)}% of its survivors join us.`;
}

/** Offer a union to much smaller, declining neighbours; accept an open offer from a larger tribe. */
function unionCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const s = snap.state;
  const U = BALANCE.union;
  const t = s.tribes[tribe];
  for (const o of livingTribes(s)) {
    if (!unionEligible(s, tribe, o)) continue;
    const tile = nearestSettlementOf(snap, geo, o, U.range);
    if (tile === null) continue;
    const ot = s.tribes[o];
    const joining = Math.floor(ot.population * U.joinShare);
    const renew = hasOpenOffer(s, tribe, o, snap.turn) ? " (renews our earlier offer)" : "";
    out.push(
      candidate(
        tribe,
        `offer_union_${o}`,
        "offer_union",
        ZERO,
        `No stock cost; offer to take in ${tribeName(o)}${renew}, which is declining (${ot.population} people, ${ot.food} food) while we have ${t.population}. If ${tribeName(o)} accepts on one of the next ${U.offerTurns} turns, about ${joining} of its people join us with all its land, settlements, buildings, stores, and technologies, and it ceases to be a separate tribe. We must feed them (we hold ${t.food} food).`,
        [`If accepted: +about ${joining} people, ${tribeName(o)}'s land and knowledge`],
        ["The other tribe may refuse; this turn's effort is spent either way"],
        { type: "settlement", tribeId: o, tile, label: `${tribeName(o)} settlement` },
      ),
    );
  }
  for (const offer of acceptableOffers(s, tribe, snap.turn)) {
    const big = s.tribes[offer.from];
    const joining = Math.floor(t.population * U.joinShare);
    out.push(
      candidate(
        tribe,
        `accept_union_${offer.from}`,
        "accept_union",
        ZERO,
        `No stock cost; accept ${tribeName(offer.from)}'s offer (made ${snap.turn - offer.turn} turn${snap.turn - offer.turn === 1 ? "" : "s"} ago) and join it. About ${joining} of our ${t.population} people move in with ${tribeName(offer.from)} (${big.population} people, ${big.food} food); our land, settlements, buildings, stores, and technologies become part of it and ${tribeName(tribe)} ends as a separate tribe. Our people then share its food and shelter.`,
        [`Our people join ${tribeName(offer.from)}; ${tribeName(tribe)} ends as a separate tribe`],
        ["Irreversible"],
        { type: "settlement", tribeId: offer.from, tile: big.settlement, label: `${tribeName(offer.from)} settlement` },
      ),
    );
  }
}

function recruitCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const R = BALANCE.actions.recruit;
  const s = snap.state;
  const t = s.tribes[tribe];
  if (!affordable(s, tribe, R.cost) || t.population <= 0) return;
  if ((t.food - R.cost.food) / t.population <= 2) return;
  const spare = shelterOutlook(s, tribe, geo).spare;
  if (spare <= 0) return;
  const sources = livingTribes(s).filter((o) => {
    if (o === tribe) return false;
    const os = s.tribes[o];
    return nearestSettlementOf(snap, geo, o, reach(geo, R.range)) !== null && os.population > 1 && os.food / Math.max(1, os.population) < 1;
  });
  const ranked = rankTop(sources, (a, b) => s.tribes[a].food / s.tribes[a].population - s.tribes[b].food / s.tribes[b].population || (a < b ? -1 : 1), 2);
  for (const src of ranked) {
    const os = s.tribes[src];
    const n = Math.min(R.max, Math.floor(os.population * R.fraction), spare, os.population - 1);
    if (n < 1) continue;
    const tile = nearestSettlementOf(snap, geo, src, reach(geo, R.range)) as number;
    out.push(
      candidate(
        tribe,
        `recruit_${src}`,
        "recruit",
        R.cost,
        `${costText(R.cost)}; invite up to ${n} people from ${tribeName(src)}, which has under one turn of food (${os.food} food for ${os.population}). They join only if housing is still free after this turn's raids.`,
        [`+up to ${n} population, reducing ${tribeName(src)} by the same amount`],
        [`Relations with ${tribeName(src)} worsen slightly`],
        { type: "settlement", tribeId: src, tile, label: `${tribeName(src)} settlement` },
      ),
    );
  }
}

function scoutingCandidates(snap: Snapshot, tribe: TribeId, geo: TribeGeo, out: ActionCandidate[]) {
  const s = snap.state;
  const t = s.tribes[tribe];
  const A = BALANCE.actions;
  const settlementCount = 1 + t.outposts.length;
  if (settlementCount >= A.found.maxSettlements) return;
  if (affordable(s, tribe, A.scout.cost)) {
    const known = t.scoutedSites.length ? ` Currently known sites: ${t.scoutedSites.length}; scouting again replaces them with a fresh survey.` : "";
    const access = accessibleTiles(s, geo);
    const wild = Math.floor(sumStock(s.world, access, "forage") + sumStock(s.world, access, "wildlife"));
    const wildCap = Math.floor(sumCap(s.world, access, "forage") + sumCap(s.world, access, "wildlife"));
    out.push(
      candidate(
        tribe,
        "send_scouts",
        "send_scouts",
        A.scout.cost,
        `${costText(A.scout.cost)}; scouts survey unclaimed land up to ${reach(geo, A.scout.range)} travel units from our settlements and report the best ${A.scout.sitesFound} sites for an additional settlement (at least ${BALANCE.placement.minSeparation} units from every settlement). A later Found settlement action can settle one, adding territory and a working area around it while people and stores stay shared. Our current working area holds ${wild} wild food of ${wildCap} capacity for ${t.population} people. Founding later costs ${A.found.cost.food} food and ${A.found.cost.timber} timber and needs at least ${A.found.minPopulation} people (we hold ${t.food} food and ${t.timber} timber). Reports stay valid for ${A.scout.expiresAfter} turns.${known}`,
        [`Reveals up to ${A.scout.sitesFound} sites where a new settlement would open fresh land for food and growth`],
        ["Scouts may find nothing if no free land meets the spacing rule"],
      ),
    );
  }
  if (t.population < A.found.minPopulation || !affordable(s, tribe, A.found.cost) || t.scoutedSites.length === 0) return;
  const buffer = settlementBuffer(s);
  for (const site of t.scoutedSites) {
    if (!siteUsable(s, site.tile, buffer)) continue;
    const note = announcedNote(snap, site.tile);
    out.push(
      candidate(
        tribe,
        `found_settlement_at_${site.tile}`,
        "found_settlement",
        A.found.cost,
        `${costText(A.found.cost)}; found a new settlement at the scouted ${directionLabel(geo.settlement, site.tile)} ${site.terrain} site ${site.distance} travel units away (nearby: ${site.food} wild food and farm potential, ${site.fish} fish, ${site.timber} timber, ${site.stone} stone capacity). It claims up to ${A.found.territoryTiles} surrounding tiles and adds a portable camp for ${A.found.campCapacity} people; working range then extends from it. Population, stores, and technologies stay shared across the tribe (settlement ${settlementCount + 1} of at most ${A.found.maxSettlements}).`,
        [`New settlement with up to ${A.found.territoryTiles} tiles of fresh territory, a new working area for food, and camp shelter for ${A.found.campCapacity} people`],
        ["Fails (with refund) if another tribe settles the same site this turn", ...(note ? [note] : [])],
        { type: "tile", tile: site.tile, label: `scouted ${site.terrain} site` },
      ),
    );
  }
}

const KIND_ORDER: ActionKind[] = [
  "rest",
  "gather_food",
  "gather_timber",
  "quarry_stone",
  "establish_farm",
  "establish_hunt",
  "establish_fishery",
  "build_housing",
  "repair_shelter",
  "build_defenses",
  "train",
  "research_start",
  "research_continue",
  "research_cancel",
  "relocate",
  "expand",
  "raid",
  "defend",
  "recruit",
  "send_scouts",
  "found_settlement",
  "offer_union",
  "accept_union",
];

/** Enforce the candidate cap: drop second location/target variants first, never a whole action type or a technology. */
function capCandidates(list: ActionCandidate[]): ActionCandidate[] {
  const max = BALANCE.actions.maxCandidates;
  if (list.length <= max) return list;
  const seenKinds = new Set<string>();
  const primary: ActionCandidate[] = [];
  const secondary: ActionCandidate[] = [];
  for (const c of list) {
    const key = c.kind === "research_start" || c.kind === "build_housing" ? c.id : c.kind;
    if (seenKinds.has(key)) secondary.push(c);
    else {
      seenKinds.add(key);
      primary.push(c);
    }
  }
  const room = Math.max(0, max - primary.length);
  const keep = new Set([...primary, ...secondary.slice(0, room)]);
  return list.filter((c) => keep.has(c));
}

export function generateCandidates(snap: Snapshot, tribe: TribeId): ActionCandidate[] {
  const s = snap.state;
  const geo = snap.geo[tribe];
  if (!geo || !s.tribes[tribe].alive) return [];
  const out: ActionCandidate[] = [];
  const t = s.tribes[tribe];
  out.push(candidate(tribe, "rest", "rest", ZERO, `No stock cost; the community rests and recovers ${BALANCE.actions.restMorale} morale (now ${t.morale}/100). Existing sites keep producing.`, [`+${BALANCE.actions.restMorale} morale`]));
  gatherCandidates(snap, tribe, geo, out);
  siteCandidates(snap, tribe, geo, out);
  housingCandidates(snap, tribe, geo, out);
  repairCandidates(snap, tribe, geo, out);
  const D = BALANCE.actions.defenses;
  const fort = fortLevel(s, tribe);
  if (fort < fortCap(s, tribe) && affordable(s, tribe, D.cost)) {
    out.push(
      candidate(
        tribe,
        "build_defenses",
        "build_defenses",
        D.cost,
        `${costText(D.cost)}; raise fortification at the settlement from level ${fort} to ${fort + 1} (+${Math.round(BALANCE.combat.fortStep * 100)}% defense each level; cap ${fortCap(s, tribe)}${fortCap(s, tribe) < D.techCap ? " without Fortification" : ""}). Applies from next turn; stays at this location if the tribe moves.`,
        [`Fortification level ${fort + 1}`],
      ),
    );
  }
  const TR = BALANCE.actions.train;
  if (t.militaryLevel < TR.cap && affordable(s, tribe, TR.cost)) {
    out.push(candidate(tribe, "train", "train", TR.cost, `${costText(TR.cost)}; raise military level from ${t.militaryLevel} to ${t.militaryLevel + 1} (+25% attack and defense per level). Applies from next turn.`, [`Military level ${t.militaryLevel + 1}`]));
  }
  researchCandidates(snap, tribe, out);
  relocationCandidates(snap, tribe, geo, out);
  expansionCandidates(snap, tribe, geo, out);
  raidCandidates(snap, tribe, geo, out);
  out.push(candidate(tribe, "defend", "defend", ZERO, `No stock cost; stand ready so settlement defense is ×${BALANCE.actions.defendMultiplier} against any raid this turn. No lasting military gain.`, [`Defense ×${BALANCE.actions.defendMultiplier} this turn`]));
  recruitCandidates(snap, tribe, geo, out);
  scoutingCandidates(snap, tribe, geo, out);
  unionCandidates(snap, tribe, geo, out);

  const ordered = out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => KIND_ORDER.indexOf(a.c.kind) - KIND_ORDER.indexOf(b.c.kind) || a.i - b.i)
    .map((x) => x.c);
  return capCandidates(ordered);
}

export function generateAllCandidates(snap: Snapshot): Partial<Record<TribeId, ActionCandidate[]>> {
  const out: Partial<Record<TribeId, ActionCandidate[]>> = {};
  for (const id of livingTribes(snap.state)) out[id] = generateCandidates(snap, id);
  return out;
}

export function actionName(kind: ActionKind): string {
  return ACTIONS[kind].name;
}

export { foodOutlook };

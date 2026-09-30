// Compact, whitelisted decision context for Jev. Built only from canonical engine state.
// Never includes the player's supported tribe, the seed, future Nature choices, or the event schedule.

import { BALANCE } from "@/content/balance";
import { EVENT_BY_ID } from "@/content/events";
import { TECH_BY_ID } from "@/content/technologies";
import { TRIBES } from "@/content/tribes";
import { calendarOf, seasonOf } from "./calendar";
import type { Snapshot } from "./candidates";
import { accessibleTiles, livingTribes } from "./geo";
import { relationLabel, turnsAgo } from "./memory";
import { activeSiteCount, capabilities, gatherPotential, housingCapacity, laborFactor } from "./production";
import { acceptableOffers, unionEligible } from "./unions";
import { productiveOwnedTiles } from "./score";
import { foodOutlook, fortCap, fortLevel, moraleLabel, shelterOutlook } from "./stats";
import { TERRAIN_NAMES, TRIBE_IDS, type TribeId } from "./types";
import { sumCap, sumStock } from "./world/territory";

export interface PublicTribeSummary {
  id: TribeId;
  name: string;
  status: "active" | "disappeared";
  population: number;
  foodStatus: string;
  militaryLevel: number;
  fortification: number;
  settlementTerrain: string;
  settlements: number;
  technologiesLearned: number;
  lastAction: string | null;
}

export interface TribeView {
  tribe: { id: TribeId; name: string; description: string; traits: string[]; preferences: string[]; innateCapabilities: string[] };
  population: number;
  morale: { value: number; level: string };
  food: { stock: number; expectedIncomePerTurn: number; consumptionPerTurn: number; netPerTurn: number; coverageTurns: number; status: string };
  materials: { timber: number; stone: number };
  shelter: { usableCapacity: number; coverage: number; averageCondition: number; unsheltered: number; spare: number; dormantCapacity: number; winterExposureRisk: string };
  military: { level: number; fortification: number; fortificationCap: number };
  territory: { claimedTiles: number; productiveTiles: number; workingRange: number; movementBudget: number; settlementTerrain: string };
  settlements: { role: "capital" | "outpost"; terrain: string }[];
  scoutedSites: { terrain: string; travelDistance: number; foodPotential: number; fish: number; timber: number; stone: number; reportedTurnsAgo: number }[];
  sites: { farms: number; huntingSites: number; fisheries: number; dormantAssets: number; laborCoverage: number };
  technologies: { learned: string[]; currentProject: string | null };
  reachableResources: Record<string, { available: number; capacity: number; level: string }>;
  neighbors: { id: TribeId; name: string; travelDistance: number | null; relation: string; population: number; militaryLevel: number; fortification: number; foodStatus: string }[];
  recentActions: string[];
  memory: string[];
  /** Short engine-computed notes on what limits this tribe's growth (factual, never a recommendation of one action). */
  advisories: string[];
}

export interface DecisionState {
  calendar: { turn: number; season: string; year: number; seasonTurn: string; turnsRemaining: number; nextSeason: string };
  announcedEvent: { id: string; title: string; option: string; summary: string; area: string; durationTurns: number; settlementsInArea: string[] };
  publicTribes: PublicTribeSummary[];
  views: Partial<Record<TribeId, TribeView>>;
}

/** Turns until the next winter turn (0 when it is winter now). */
function turnsToWinter(turn: number): number {
  for (let k = 0; k < 8; k++) if (seasonOf(turn + k) === "winter") return k;
  return 0;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** What stands between this tribe and growth: shelter, the birth limit, depleted land, and ready opportunities. */
export function growthAdvisories(
  snap: Snapshot,
  id: TribeId,
  sh: ReturnType<typeof shelterOutlook>,
  food: ReturnType<typeof foodOutlook>,
  wild: { available: number; capacity: number },
  timberPerGather: number,
): string[] {
  const t = snap.state.tribes[id];
  const P = BALANCE.population;
  const out: string[] = [];
  if (sh.unsheltered > 0) {
    const k = turnsToWinter(snap.turn);
    out.push(
      `${fmt(sh.unsheltered)} of ${fmt(t.population)} people have no shelter; ${k === 0 ? "it is winter now" : `winter starts in ${k} turn${k === 1 ? "" : "s"}`}, when ${Math.round(P.winterExposure * 100)}% of the unsheltered die each turn (more in storms). Housing protects them.`,
    );
  }
  const H = BALANCE.actions.woodHousing;
  if (sh.unsheltered > 0 && t.timber < H.cost.timber) {
    out.push(`Wooden homes for ${fmt(housingCapacity("wood", t.population))} people cost ${fmt(H.cost.timber)} timber and stores hold ${fmt(t.timber)}; one turn of gathering timber yields about ${fmt(timberPerGather)}, enough for a home.`);
  }
  const birthCap = Math.floor(sh.usableCapacity * P.overcrowding);
  if (t.population >= birthCap) out.push(`Births have stopped: the population is above ${P.overcrowding}× shelter (${fmt(birthCap)}). Only new housing lets the tribe grow again.`);
  else if (t.population >= birthCap * 0.8) out.push(`Births will stop at ${fmt(birthCap)} people (${P.overcrowding}× shelter); new housing raises that limit.`);
  if (wild.capacity > 0 && wild.available / wild.capacity < 0.35 && 1 + t.outposts.length < BALANCE.actions.found.maxSettlements) {
    out.push(`Wild food in the working area is at ${Math.round((wild.available / wild.capacity) * 100)}% of capacity; scouting and founding a new settlement open fresh land.`);
  }
  if (t.scoutedSites.length > 0 && t.population >= BALANCE.actions.found.minPopulation) {
    out.push(`Scouts have found ${t.scoutedSites.length} site${t.scoutedSites.length === 1 ? "" : "s"} for a new settlement, which adds a new working area and camp shelter for ${fmt(BALANCE.actions.found.campCapacity)}.`);
  }
  for (const o of livingTribes(snap.state)) {
    if (o !== id && unionEligible(snap.state, id, o)) {
      const other = snap.state.tribes[o];
      out.push(`${TRIBES[o].name} has only ${fmt(other.population)} people to our ${fmt(t.population)}. Offering a union would bring about ${fmt(other.population * BALANCE.union.joinShare)} people, its land, stores, and technologies into our tribe if it accepts.`);
    }
  }
  for (const offer of acceptableOffers(snap.state, id, snap.turn)) {
    const big = snap.state.tribes[offer.from];
    out.push(`${TRIBES[offer.from].name} (${fmt(big.population)} people) has offered to take us in. Joining would keep ${fmt(t.population * BALANCE.union.joinShare)} of our people fed and sheltered inside a far larger tribe; alone we risk ${t.population < BALANCE.combat.conquestBelow ? "conquest" : "further decline"}, and below ${fmt(BALANCE.population.collapseBelow)} people a tribe breaks apart.`);
  }
  if (food.coverageTurns >= 3 && (sh.unsheltered > 0 || t.population >= birthCap * 0.8)) out.push(`Stores cover ${food.coverageTurns} turns of food: enough security to invest in shelter or new land.`);
  return out;
}

function level(avail: number, cap: number): string {
  if (cap <= 0) return "none";
  const r = avail / cap;
  if (r < 0.25) return "depleted";
  if (r < 0.6) return "reduced";
  return "healthy";
}

export function buildDecisionState(snap: Snapshot, memoryLimit = 6): DecisionState {
  const s = snap.state;
  const cal = calendarOf(snap.turn);
  const a = snap.announced;
  const event = EVENT_BY_ID[a.eventId];
  const option = event?.options.find((o) => o.id === a.optionId);
  const living = livingTribes(s);

  const publicTribes: PublicTribeSummary[] = TRIBE_IDS.map((id) => {
    const t = s.tribes[id];
    const geo = snap.geo[id];
    const food = geo && t.alive ? foodOutlook(s, id, geo, snap.mods, snap.season) : null;
    const last = t.recentActions[t.recentActions.length - 1];
    return {
      id,
      name: TRIBES[id].name,
      status: t.alive ? "active" : "disappeared",
      population: t.population,
      foodStatus: food ? food.status : "none",
      militaryLevel: t.militaryLevel,
      fortification: t.alive ? fortLevel(s, id) : 0,
      settlementTerrain: TERRAIN_NAMES[s.world.terrain[t.settlement] as number] as string,
      settlements: t.alive ? 1 + t.outposts.length : 0,
      technologiesLearned: t.learned.length,
      lastAction: last && last.turn === snap.turn - 1 ? last.kind : null,
    };
  });

  const views: Partial<Record<TribeId, TribeView>> = {};
  for (const id of living) {
    const t = s.tribes[id];
    const geo = snap.geo[id];
    if (!geo) continue;
    const profile = TRIBES[id];
    const food = foodOutlook(s, id, geo, snap.mods, snap.season);
    const sh = shelterOutlook(s, id, geo);
    const access = accessibleTiles(s, geo);
    const caps = capabilities(s, id);
    const idx = TRIBE_IDS.indexOf(id);
    let claimed = 0;
    for (let i = 0; i < s.world.owner.length; i++) if (s.world.owner[i] === idx) claimed++;
    const assets = s.world.assets.filter((x) => x.owner === id);
    const activeCount = (k: string) => assets.filter((x) => x.kind === k && (geo.work.dist[x.tile] as number) >= 0).length;
    const dormant = assets.filter((x) => x.kind !== "defenses" && (geo.work.dist[x.tile] as number) < 0).length;
    const resources: TribeView["reachableResources"] = {};
    for (const r of ["forage", "wildlife", "timber", "stone"] as const) {
      const av = Math.floor(sumStock(s.world, access, r));
      const cap = Math.floor(sumCap(s.world, access, r));
      resources[r] = { available: av, capacity: cap, level: level(av, cap) };
    }
    const fishTiles = geo.work.reached.filter((x) => s.world.terrain[x] === 0);
    resources.fish = { available: Math.floor(sumStock(s.world, fishTiles, "fish")), capacity: Math.floor(sumCap(s.world, fishTiles, "fish")), level: level(sumStock(s.world, fishTiles, "fish"), sumCap(s.world, fishTiles, "fish")) };
    const upcomingWinter = snap.season === "winter" || seasonOf(snap.turn + 2) === "winter";
    const neighbors = living
      .filter((o) => o !== id)
      .map((o) => {
        const ot = s.tribes[o];
        const d = geo.move.dist[ot.settlement] as number;
        const ogeo = snap.geo[o];
        return {
          id: o,
          name: TRIBES[o].name,
          travelDistance: d >= 0 ? d : null,
          relation: relationLabel(t.relations[o] ?? 0),
          population: ot.population,
          militaryLevel: ot.militaryLevel,
          fortification: fortLevel(s, o),
          foodStatus: ogeo ? foodOutlook(s, o, ogeo, snap.mods, snap.season).status : "unknown",
        };
      });
    const project = t.project ? `${TECH_BY_ID[t.project.techId]?.name ?? t.project.techId} (${t.project.progress}/${t.project.required} effort turns)` : null;
    views[id] = {
      tribe: {
        id,
        name: profile.name,
        description: profile.description,
        traits: profile.traits,
        preferences: profile.preferences,
        innateCapabilities: Object.entries(caps)
          .filter(([, v]) => v)
          .map(([k]) => k),
      },
      population: t.population,
      morale: { value: t.morale, level: moraleLabel(t.morale) },
      food: {
        stock: t.food,
        expectedIncomePerTurn: food.expectedIncome,
        consumptionPerTurn: food.consumption,
        netPerTurn: food.net,
        coverageTurns: food.coverageTurns,
        status: food.status,
      },
      materials: { timber: t.timber, stone: t.stone },
      shelter: {
        usableCapacity: sh.usableCapacity,
        coverage: sh.coverage,
        averageCondition: sh.averageCondition,
        unsheltered: sh.unsheltered,
        spare: sh.spare,
        dormantCapacity: sh.dormantCapacity,
        winterExposureRisk: sh.unsheltered === 0 ? "none" : upcomingWinter ? `${sh.unsheltered} people unsheltered with winter ${snap.season === "winter" ? "now" : "approaching"}` : `${sh.unsheltered} people unsheltered (exposure only matters in winter or severe events)`,
      },
      military: { level: t.militaryLevel, fortification: fortLevel(s, id), fortificationCap: fortCap(s, id) },
      territory: {
        claimedTiles: claimed,
        productiveTiles: productiveOwnedTiles(s, id, geo),
        workingRange: geo.workingRange,
        movementBudget: geo.movementBudget,
        settlementTerrain: TERRAIN_NAMES[s.world.terrain[t.settlement] as number] as string,
      },
      settlements: [t.settlement, ...t.outposts].map((tile, i) => ({ role: i === 0 ? ("capital" as const) : ("outpost" as const), terrain: TERRAIN_NAMES[s.world.terrain[tile] as number] as string })),
      scoutedSites: t.scoutedSites.map((x) => ({ terrain: x.terrain, travelDistance: x.distance, foodPotential: x.food, fish: x.fish, timber: x.timber, stone: x.stone, reportedTurnsAgo: snap.turn - x.foundTurn })),
      sites: {
        farms: activeCount("farm"),
        huntingSites: activeCount("hunt"),
        fisheries: activeCount("fishery"),
        dormantAssets: dormant,
        laborCoverage: Math.round(laborFactor(s, id, activeSiteCount(s, id, geo)) * 100) / 100,
      },
      technologies: { learned: t.learned.map((x) => TECH_BY_ID[x]?.name ?? x), currentProject: project },
      reachableResources: resources,
      neighbors,
      advisories: growthAdvisories(snap, id, sh, food, {
        available: resources.forage!.available + resources.wildlife!.available,
        capacity: resources.forage!.capacity + resources.wildlife!.capacity,
      }, Math.min(Math.floor(gatherPotential(s, id, "timber", snap.mods, t.settlement)), resources.timber!.available)),
      recentActions: t.recentActions.slice(-3).map((r) => `${turnsAgo(snap.turn, r.turn)}: ${r.kind.replace(/_/g, " ")}`),
      memory: t.memory.slice(-memoryLimit).map((m) => `${turnsAgo(snap.turn, m.turn)}: ${m.text}`),
    };
  }

  const inArea = living.filter((id) => a.footprint === null || [s.tribes[id].settlement, ...s.tribes[id].outposts].some((x) => a.footprint!.includes(x))).map((id) => TRIBES[id].name);
  return {
    calendar: {
      turn: cal.turn,
      season: cal.season,
      year: cal.year,
      seasonTurn: cal.phase,
      turnsRemaining: s.totalTurns - cal.turn,
      nextSeason: seasonOf(snap.turn + 2),
    },
    announcedEvent: {
      id: a.eventId,
      title: a.title,
      option: a.optionLabel,
      summary: option?.description ?? a.description,
      area: a.footprintLabel,
      durationTurns: option?.duration ?? 0,
      settlementsInArea: inArea,
    },
    publicTribes,
    views,
  };
}

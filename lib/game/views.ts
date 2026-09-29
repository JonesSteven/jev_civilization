// Compact, whitelisted decision context for Jev. Built only from canonical engine state.
// Never includes the player's supported tribe, the seed, future Nature choices, or the event schedule.

import { EVENT_BY_ID } from "@/content/events";
import { TECH_BY_ID } from "@/content/technologies";
import { TRIBES } from "@/content/tribes";
import { calendarOf, seasonOf, TOTAL_TURNS } from "./calendar";
import type { Snapshot } from "./candidates";
import { accessibleTiles, livingTribes } from "./geo";
import { relationLabel, turnsAgo } from "./memory";
import { activeSiteCount, capabilities, laborFactor } from "./production";
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
  sites: { farms: number; huntingSites: number; fisheries: number; dormantAssets: number; laborCoverage: number };
  technologies: { learned: string[]; currentProject: string | null };
  reachableResources: Record<string, { available: number; capacity: number; level: string }>;
  neighbors: { id: TribeId; name: string; travelDistance: number | null; relation: string; population: number; militaryLevel: number; fortification: number; foodStatus: string }[];
  recentActions: string[];
  memory: string[];
}

export interface DecisionState {
  calendar: { turn: number; season: string; year: number; seasonTurn: string; turnsRemaining: number; nextSeason: string };
  announcedEvent: { id: string; title: string; option: string; summary: string; area: string; durationTurns: number; settlementsInArea: string[] };
  publicTribes: PublicTribeSummary[];
  views: Partial<Record<TribeId, TribeView>>;
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
      recentActions: t.recentActions.slice(-3).map((r) => `${turnsAgo(snap.turn, r.turn)}: ${r.kind.replace(/_/g, " ")}`),
      memory: t.memory.slice(-memoryLimit).map((m) => `${turnsAgo(snap.turn, m.turn)}: ${m.text}`),
    };
  }

  const inArea = living.filter((id) => a.footprint === null || a.footprint.includes(s.tribes[id].settlement)).map((id) => TRIBES[id].name);
  return {
    calendar: {
      turn: cal.turn,
      season: cal.season,
      year: cal.year,
      seasonTurn: cal.phase,
      turnsRemaining: TOTAL_TURNS - cal.turn,
      nextSeason: seasonOf(Math.min(snap.turn + 2, TOTAL_TURNS + 1)),
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

// Browser-facing projections of canonical state. The browser renders these; it never sends state back.
// (No secrets exist in game state; this module also omits session identifiers and database details.)

import { EVENT_BY_ID } from "@/content/events";
import { TECH_BY_ID } from "@/content/technologies";
import { calendarOf, seasonOf, TOTAL_TURNS } from "@/lib/game/calendar";
import { ModifierIndex } from "@/lib/game/effects/modifiers";
import { computeGeo, type TribeGeo } from "@/lib/game/geo";
import { relationLabel } from "@/lib/game/memory";
import { activeSiteCount, laborFactor } from "@/lib/game/production";
import { productiveOwnedTiles, scoreTribe, winners } from "@/lib/game/score";
import { worldView, type WorldView } from "@/lib/game/serialize";
import { foodOutlook, fortCap, fortLevel, moraleLabel, shelterOutlook } from "@/lib/game/stats";
import { TRIBE_IDS, type EffectOp, type GameState, type ScoreBreakdown, type TribeId } from "@/lib/game/types";

export interface TribePanel {
  id: TribeId;
  alive: boolean;
  eliminatedTurn: number | null;
  settlement: number;
  population: number;
  food: number;
  timber: number;
  stone: number;
  morale: number;
  moraleLevel: string;
  militaryLevel: number;
  fortification: number;
  fortificationCap: number;
  foodOutlook: { expectedIncome: number; consumption: number; net: number; coverageTurns: number; status: string } | null;
  shelter: ReturnType<typeof shelterOutlook> | null;
  camp: { capacity: number; condition: number } | null;
  technologies: string[];
  project: { techId: string; name: string; progress: number; required: number } | null;
  recentActions: { turn: number; kind: string; label: string }[];
  memory: { turn: number; kind: string; text: string }[];
  relations: { id: TribeId; value: number; label: string }[];
  score: ScoreBreakdown;
  productiveTiles: number;
  claimedTiles: number;
  sites: { farms: number; hunts: number; fisheries: number; housing: number; dormant: number; laborCoverage: number };
  history: { turn: number; population: number; food: number; score: number }[];
  milestones: { turn: number; text: string }[];
}

export function describeEffect(op: EffectOp): string {
  const pct = (f: number) => `${f >= 1 ? "+" : ""}${Math.round((f - 1) * 100)}%`;
  const where = (o: { scope: string; terrain?: string[]; nearWater?: boolean }) => {
    const parts: string[] = [];
    if (o.terrain) parts.push(o.terrain.join("/"));
    if (o.nearWater) parts.push("near water");
    return `${parts.length ? parts.join(" ") + " " : ""}${o.scope === "world" ? "everywhere" : "in the highlighted area"}`;
  };
  const dur = (d: number) => `for ${d} turn${d === 1 ? "" : "s"}`;
  switch (op.op) {
    case "yieldMult":
      return `${op.channel === "timber" || op.channel === "stone" ? `${op.channel} gathering` : `${op.channel} output`} ${pct(op.factor)} ${where(op)} ${dur(op.duration)}`;
    case "dryFarm":
      return `Drought: farm output ${pct(op.factor)} ${where(op)} ${dur(op.duration)} (Irrigation floors this at −40%)`;
    case "travelMod":
      return `Travel cost ${op.delta > 0 ? "+" : ""}${op.delta} ${where(op)} ${dur(op.duration)}`;
    case "regen":
      return `${op.resource} regrowth ×${op.factor} ${where(op)} ${dur(op.duration)}`;
    case "stockAdjust":
      return op.fraction >= 0
        ? `${op.resource} stocks +${Math.round(op.fraction * 100)}% of capacity ${where(op)} (once)`
        : `${op.resource} stocks −${Math.round(Math.min(-op.fraction, 0.2) * 100)}% ${where(op)} (once)`;
    case "capacityAdjust":
      return `${op.resource} capacity ${op.fraction >= 0 ? "+" : ""}${Math.round(op.fraction * 100)}% ${where(op)} (permanent)`;
    case "shelterDamage":
      return `Shelter condition −${op.amount} (${op.types ? op.types.join("/") : "all housing"}) ${where(op)} (once)`;
    case "recurringShelterDamage":
      return `Shelter condition −${op.amount} each turn (${op.types ? op.types.join("/") : "all housing"}) ${where(op)} ${dur(op.duration)}`;
    case "exposure":
      return `Cold exposure ${op.add > 0 ? "+" : ""}${(op.add * 100).toFixed(1)} points for unsheltered people ${dur(op.duration)}`;
    case "spoilage":
      return `Food spoilage ${op.add > 0 ? "+" : ""}${Math.round(op.add * 100)}% per turn ${dur(op.duration)}`;
    case "fertility":
      return `Soil fertility ${op.delta > 0 ? "+" : ""}${op.delta} ${where(op)} (permanent)`;
    case "convertTile":
      return `${Math.round(op.fraction * 100)}% of ${op.from} becomes ${op.to} in the highlighted area (permanent; built tiles excluded)`;
    case "overlay":
      return `${op.flag} ${op.flag === "Cave" || op.flag === "Sheltered" ? "natural shelter (8 or 4 people each, max 24 per tribe) " : ""}on ${Math.round(op.fraction * 100)}% of eligible tiles ${where(op)}${op.duration ? ` ${dur(op.duration)}` : ""}`;
    case "settlementStock":
      return `Settlements ${where(op)} gain ${op.amount} ${op.resource} (once)`;
    case "delayed":
      return `In ${op.afterTurns} turns: ${op.label} — ${op.effects.map(describeEffect).join("; ")}`;
  }
}

export function eventCard(state: GameState) {
  const p = state.currentEvent;
  if (!p) return null;
  const ev = EVENT_BY_ID[p.eventId];
  if (!ev) return null;
  return {
    turn: p.turn,
    eventId: ev.id,
    title: ev.title,
    question: ev.question,
    source: p.source,
    footprint: p.footprint,
    footprintLabel: p.footprintLabel,
    fallback: p.fallback,
    natureOptionId: p.natureOptionId,
    options: ev.options.map((o) => ({ id: o.id, label: o.label, description: o.description, duration: o.duration, tone: o.tone, effects: o.effects.map(describeEffect) })),
  };
}

export function presentGeo(state: GameState): Record<TribeId, TribeGeo> {
  const mods = new ModifierIndex(state, state.activeEffects);
  const turn = Math.min(state.completedTurn + 1, TOTAL_TURNS);
  return computeGeo(state, mods.travelDelta(seasonOf(turn)));
}

export function tribePanels(state: GameState): TribePanel[] {
  const mods = new ModifierIndex(state, state.activeEffects);
  const turn = Math.min(state.completedTurn + 1, TOTAL_TURNS);
  const season = seasonOf(turn);
  const geo = computeGeo(state, mods.travelDelta(season));
  return TRIBE_IDS.map((id) => {
    const t = state.tribes[id];
    const g = geo[id];
    const idx = TRIBE_IDS.indexOf(id);
    let claimed = 0;
    for (let i = 0; i < state.world.owner.length; i++) if (state.world.owner[i] === idx) claimed++;
    const assets = state.world.assets.filter((a) => a.owner === id);
    const active = (k: string) => (g ? assets.filter((a) => a.kind === k && (g.work.dist[a.tile] as number) >= 0).length : 0);
    return {
      id,
      alive: t.alive,
      eliminatedTurn: t.eliminatedTurn,
      settlement: t.settlement,
      population: t.population,
      food: t.food,
      timber: t.timber,
      stone: t.stone,
      morale: t.morale,
      moraleLevel: moraleLabel(t.morale),
      militaryLevel: t.militaryLevel,
      fortification: t.alive ? fortLevel(state, id) : 0,
      fortificationCap: fortCap(state, id),
      foodOutlook: g && t.alive ? foodOutlook(state, id, g, mods, season) : null,
      shelter: g && t.alive ? shelterOutlook(state, id, g) : null,
      camp: t.camp,
      technologies: t.learned.map((x) => TECH_BY_ID[x]?.name ?? x),
      project: t.project ? { techId: t.project.techId, name: TECH_BY_ID[t.project.techId]?.name ?? t.project.techId, progress: t.project.progress, required: t.project.required } : null,
      recentActions: t.recentActions,
      memory: t.memory,
      relations: TRIBE_IDS.filter((o) => o !== id).map((o) => ({ id: o, value: t.relations[o] ?? 0, label: relationLabel(t.relations[o] ?? 0) })),
      score: scoreTribe(state, id, g),
      productiveTiles: g && t.alive ? productiveOwnedTiles(state, id, g) : 0,
      claimedTiles: claimed,
      sites: {
        farms: active("farm"),
        hunts: active("hunt"),
        fisheries: active("fishery"),
        housing: active("housing"),
        dormant: g ? assets.filter((a) => a.kind !== "defenses" && (g.work.dist[a.tile] as number) < 0).length : 0,
        laborCoverage: g && t.alive ? laborFactor(state, id, activeSiteCount(state, id, g)) : 0,
      },
      history: t.history,
      milestones: t.milestones,
    };
  });
}

export interface GameMeta {
  id: string;
  mode: "live" | "mock";
  status: string;
  supportedTribeId: TribeId;
  version: number;
  configuredModel: string;
  createdAt: number;
  attemptsUsed: number;
  maxAttempts: number;
  usage: { inputTokens: number; outputTokens: number; unknownAttempts: number };
}

export interface PendingView {
  intentId: string;
  turn: number;
  status: string;
  idempotencyKey: string;
  optionId: string;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  leaseActive: boolean;
}

export function presentGame(meta: GameMeta, state: GameState, pending: PendingView | null) {
  const turn = Math.min(state.completedTurn + 1, TOTAL_TURNS);
  const tribes = tribePanels(state);
  const scores = Object.fromEntries(tribes.map((t) => [t.id, t.score])) as Record<TribeId, ScoreBreakdown>;
  const finished = state.completedTurn >= TOTAL_TURNS;
  return {
    ...meta,
    seed: state.seed,
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    contentHash: state.contentHash,
    generationAttempt: state.generationAttempt,
    usedFallbackMap: state.usedFallbackMap,
    completedTurn: state.completedTurn,
    calendar: calendarOf(turn),
    world: worldView(state.world) as WorldView,
    tribes,
    activeEffects: state.activeEffects.map((e) => ({ id: e.id, label: e.label, description: describeEffect(e.op), remaining: e.remaining, footprint: e.footprint })),
    queuedEffects: state.queuedEffects.map((q) => ({ id: q.id, label: q.label, activateTurn: q.activateTurn })),
    event: finished ? null : eventCard(state),
    pending,
    winners: finished ? winners(scores) : null,
  };
}

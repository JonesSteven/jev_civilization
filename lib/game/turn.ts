// Turn pipeline (PRD §5): prepare → announce → snapshot → decide (external) → resolve actions →
// apply environment → economy → finalize. `resolveTurn` is pure with respect to its inputs: it clones
// the pre-turn state and never consumes randomness outside keyed draws.

import { BALANCE } from "@/content/balance";
import { narrate } from "@/content/narration";
import { tribeName } from "@/content/tribes";
import { seasonOf } from "./calendar";
import { buildSnapshot, generateAllCandidates, type Snapshot } from "./candidates";
import { runEconomy, type ProductionReport } from "./economy";
import { activateEnvironment, applyRecurring, expireEffects } from "./effects/dispatcher";
import { prepareEvent } from "./effects/eventSelection";
import { ModifierIndex } from "./effects/modifiers";
import { computeGeo, livingTribes } from "./geo";
import { hashState } from "./serialize";
import { ageMemories, relaxRelations, remember } from "./memory";
import { resolveActions } from "./resolve/actions";
import { organicGrowth, pruneScoutedSites } from "./settlements";
import { scoreTribe } from "./score";
import { collapseIfTooSmall, expireOffers, makeUnionOffers } from "./unions";
import { summarizeTurn, type TurnSummary } from "./summary";
import { TRIBE_IDS, type ActionCandidate, type GameOutcome, type GameState, type PreparedEvent, type ScoreBreakdown, type TribeId } from "./types";

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export interface TurnDecisionContext {
  turn: number;
  optionId: string;
  snapshot: Snapshot;
  candidates: Partial<Record<TribeId, ActionCandidate[]>>;
  preStateHash: string;
}

/** Resolve which option applies: the player's choice on odd turns, the frozen seeded option on Nature turns. */
export function effectiveOption(prepared: PreparedEvent, playerOptionId: string | null): string {
  if (prepared.source === "nature") {
    if (!prepared.natureOptionId) throw new Error("nature option not prepared");
    return prepared.natureOptionId;
  }
  if (!playerOptionId) throw new Error("player option required");
  return playerOptionId;
}

export function buildDecisionContext(state: GameState, optionId: string): TurnDecisionContext {
  const snapshot = buildSnapshot(state, optionId);
  return {
    turn: snapshot.turn,
    optionId,
    snapshot,
    candidates: generateAllCandidates(snapshot),
    preStateHash: hashState(state),
  };
}

export interface TurnResult {
  state: GameState;
  outcomes: GameOutcome[];
  reports: Record<TribeId, ProductionReport>;
  changedTiles: number[];
  scores: Record<TribeId, ScoreBreakdown>;
  eliminated: TribeId[];
  summary: TurnSummary;
}

/** The match ends at its turn limit, or as soon as one tribe (or none) is left standing. */
export function isMatchOver(state: GameState): boolean {
  if (state.completedTurn >= state.totalTurns) return true;
  return state.completedTurn > 0 && livingTribes(state).length <= 1;
}

/**
 * Resolve one turn from the frozen pre-turn state and the executed candidate IDs.
 * `frozenCandidates`, when given, must be the candidates offered to Jev; otherwise they are regenerated
 * deterministically from the same pre-state.
 */
export function resolveTurn(
  pre: GameState,
  optionId: string,
  choices: Partial<Record<TribeId, string>>,
  frozenCandidates?: Partial<Record<TribeId, ActionCandidate[]>>,
): TurnResult {
  const prepared = pre.currentEvent;
  if (!prepared) throw new Error("no prepared event");
  const turn = pre.completedTurn + 1;
  if (prepared.turn !== turn) throw new Error(`prepared event is for turn ${prepared.turn}, expected ${turn}`);
  const season = seasonOf(turn);
  const snap = buildSnapshot(pre, optionId);
  const candidates = frozenCandidates ?? generateAllCandidates(snap);

  const chosen: Partial<Record<TribeId, ActionCandidate>> = {};
  for (const id of livingTribes(pre)) {
    const cid = choices[id];
    const c = candidates[id]?.find((x) => x.id === cid);
    if (!c) throw new Error(`no legal candidate ${cid} for ${id}`);
    chosen[id] = c;
  }

  const next = cloneState(pre);
  const outcomes: GameOutcome[] = [];
  const changed = new Set<number>();
  const eliminated: TribeId[] = [];

  // 6. Actions
  const before = new Set(livingTribes(next));
  resolveActions(next, snap, chosen, turn, outcomes, changed);
  for (const id of TRIBE_IDS) if (collapseIfTooSmall(next, id, turn, outcomes, changed)) eliminated.push(id);

  // 7. Environment: activate the announced option and queued effects; recurring effects fire.
  activateEnvironment(next, prepared.eventId, optionId, prepared.footprint, turn, outcomes, changed);
  applyRecurring(next, outcomes);

  // 8. Economy with every active modifier, including ones activated this turn.
  const mods = new ModifierIndex(next, next.activeEffects);
  const geo = computeGeo(next, mods.travelDelta(season));
  const reports = runEconomy(next, geo, mods, season, turn, outcomes);
  for (const id of TRIBE_IDS) if (collapseIfTooSmall(next, id, turn, outcomes, changed)) eliminated.push(id);
  // Conquered and united tribes leave the game too.
  for (const id of TRIBE_IDS) if (before.has(id) && !next.tribes[id].alive && !eliminated.includes(id)) eliminated.push(id);

  // Shattered tribes lose heart: a big loss in one turn sinks morale, stalling births for several turns.
  for (const id of livingTribes(next)) {
    const before = pre.tribes[id].population;
    const t = next.tribes[id];
    if (before > 0 && (before - t.population) / before >= BALANCE.morale.shockShare) {
      t.morale = Math.max(BALANCE.morale.min, t.morale + BALANCE.morale.shock);
      remember(next, id, turn, "shock", `Lost ${Math.round(((before - t.population) / before) * 100)}% of our people on turn ${turn}; spirits are low`);
    }
  }

  // Organic border growth: living tribes spread onto unclaimed border land as they grow.
  const grown = organicGrowth(next, computeGeo(next, mods.travelDelta(season)));
  for (const id of TRIBE_IDS) {
    if (grown[id].length === 0) continue;
    for (const t of grown[id]) changed.add(t);
    outcomes.push({ kind: "growth", tribeId: id, text: narrate("growth", { tribe: tribeName(id), count: grown[id].length }), tiles: grown[id] });
  }
  pruneScoutedSites(next, turn);

  // 9. Finalize: durations, relations, scores, history, next event.
  expireEffects(next, changed);
  expireOffers(next, turn);
  makeUnionOffers(next, turn, outcomes);
  relaxRelations(next);
  ageMemories(next, turn);
  const finalMods = new ModifierIndex(next, next.activeEffects);
  const finalGeo = computeGeo(next, finalMods.travelDelta(seasonOf(Math.min(turn + 1, pre.totalTurns))));
  const scores = {} as Record<TribeId, ScoreBreakdown>;
  for (const id of TRIBE_IDS) {
    scores[id] = scoreTribe(next, id, finalGeo[id]);
    const t = next.tribes[id];
    t.history.push({ turn, population: t.population, food: t.food, score: Math.round(scores[id].total * 10) / 10 });
  }
  next.completedTurn = turn;
  next.currentEvent = null;
  if (!isMatchOver(next)) prepareEvent(next, turn + 1);

  const summary = summarizeTurn(pre, next, outcomes, prepared.eventId, optionId, prepared.footprint);
  return { state: next, outcomes, reports, changedTiles: [...changed].sort((a, b) => a - b), scores, eliminated, summary };
}

export function currentScores(state: GameState): Record<TribeId, ScoreBreakdown> {
  const mods = new ModifierIndex(state, state.activeEffects);
  const geo = computeGeo(state, mods.travelDelta(seasonOf(Math.min(state.completedTurn + 1, state.totalTurns))));
  const out = {} as Record<TribeId, ScoreBreakdown>;
  for (const id of TRIBE_IDS) out[id] = scoreTribe(state, id, geo[id]);
  return out;
}

/** Initialize a fresh game and prepare turn 1's event. */
export function startGame(state: GameState): GameState {
  if (state.completedTurn === 0 && !state.currentEvent) prepareEvent(state, 1);
  return state;
}

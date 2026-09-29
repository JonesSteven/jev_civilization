// Deterministic MOCK decision policy for tests, balance simulation, and keyless local development.
// It is never used in live games and every result it produces is labeled Mock simulation.

import { seasonOf } from "./calendar";
import type { Snapshot } from "./candidates";
import { makeRng } from "./rng";
import { activeSiteCount, laborFactor } from "./production";
import { foodOutlook, shelterOutlook } from "./stats";
import type { ActionCandidate, TribeId } from "./types";

export interface MockAnswer {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

function heuristic(snap: Snapshot, tribe: TribeId, c: ActionCandidate): number {
  const s = snap.state;
  const t = s.tribes[tribe];
  const geo = snap.geo[tribe];
  if (!geo) return 0;
  const food = foodOutlook(s, tribe, geo, snap.mods, snap.season);
  const shelter = shelterOutlook(s, tribe, geo);
  const nextSeason = seasonOf(snap.turn + 2);
  const hungry = food.coverageTurns < 2 || food.net < -5;
  let v = 0.2;
  switch (c.kind) {
    case "rest":
      v = t.morale < 45 ? 1.2 : 0.1;
      break;
    case "gather_food":
      v = food.coverageTurns < 1 ? 2.2 : hungry ? 1.4 : 0.4;
      break;
    case "establish_farm":
    case "establish_hunt":
    case "establish_fishery":
      // Extra sites beyond the available labor add nothing.
      v = laborFactor(s, tribe, activeSiteCount(s, tribe, geo) + 1) < 1 ? 0.05 : food.net < 10 ? 2.0 : 0.5;
      break;
    case "gather_timber":
      v = t.timber < 30 ? 1.2 : 0.3;
      break;
    case "quarry_stone":
      v = t.stone < 25 ? 0.9 : 0.2;
      break;
    case "build_housing":
      v = shelter.spare < 6 ? (nextSeason === "winter" || snap.season === "winter" ? 2 : 1.3) : 0.2;
      break;
    case "repair_shelter":
      v = shelter.averageCondition < 70 ? 1.4 : 0.3;
      break;
    case "build_defenses":
      v = Object.values(t.memory).some((m) => m.kind === "raided") ? 1.3 : 0.3;
      break;
    case "train":
      v = tribe === "ironfang" ? 0.8 : 0.25;
      break;
    case "research_start":
      v = food.coverageTurns > 3 ? 1.0 : 0.3;
      if (tribe === "ironfang" && (c.id === "research_agriculture" || c.id === "research_fishing")) v += 0.6;
      break;
    case "research_continue":
      v = food.coverageTurns > 1.5 ? 1.6 : 0.6;
      break;
    case "research_cancel":
      v = 0.05;
      break;
    case "relocate":
      v = food.net < -10 && tribe !== "hearthwood" ? 1.1 : 0.15;
      break;
    case "expand":
      v = 0.7;
      break;
    case "raid":
      v = tribe === "ironfang" ? (hungry ? 2.4 : 1.2) : hungry ? 0.6 : 0.1;
      break;
    case "defend":
      v = Object.values(t.memory).some((m) => m.kind === "raided" && m.turn >= snap.turn - 3) ? 1.2 : 0.15;
      break;
    case "recruit":
      v = 0.9;
      break;
  }
  return v;
}

/** Softmax over heuristic scores with keyed noise; deterministic for (seed, turn, tribe). */
export function mockDecide(snap: Snapshot, tribe: TribeId, candidates: ActionCandidate[]): MockAnswer {
  const rng = makeRng(snap.state.seed, "mock", snap.turn, tribe);
  const scores = candidates.map((c) => heuristic(snap, tribe, c) * 2 + rng.next() * 0.8);
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probabilities: Record<string, number> = {};
  candidates.forEach((c, i) => (probabilities[c.id] = Math.round(((exps[i] as number) / sum) * 10000) / 10000));
  let best = candidates[0] as ActionCandidate;
  for (const c of candidates) if ((probabilities[c.id] as number) > (probabilities[best.id] as number)) best = c;
  return { choice: best.id, probabilities, confidence: probabilities[best.id] as number };
}

import { BALANCE } from "@/content/balance";
import type { GameState, TribeId } from "./types";

/** Committed memory entries (max six, newest kept). Relations affect context only, never the chosen action. */
export function remember(state: GameState, tribe: TribeId, turn: number, kind: string, text: string) {
  const t = state.tribes[tribe];
  // Replace an older entry of the same kind about the same subject to keep memory relevant.
  t.memory = t.memory.filter((m) => !(m.kind === kind && m.text === text));
  t.memory.push({ turn, kind, text });
  if (t.memory.length > BALANCE.memory.maxEntries) t.memory = t.memory.slice(-BALANCE.memory.maxEntries);
}

/** Drop memories older than the balance window so context stays relevant. */
export function ageMemories(state: GameState, turn: number) {
  for (const t of Object.values(state.tribes)) t.memory = t.memory.filter((m) => turn - m.turn <= BALANCE.memory.maxAgeTurns);
}

export function adjustRelation(state: GameState, from: TribeId, to: TribeId, delta: number) {
  const t = state.tribes[from];
  const cur = t.relations[to] ?? 0;
  t.relations[to] = Math.max(BALANCE.relations.min, Math.min(BALANCE.relations.max, cur + delta));
}

/** Relations drift back toward zero by a fixed amount each turn. */
export function relaxRelations(state: GameState) {
  for (const t of Object.values(state.tribes)) {
    for (const [k, v] of Object.entries(t.relations)) {
      const step = BALANCE.relations.recoveryPerTurn;
      const n = v > 0 ? Math.max(0, v - step) : Math.min(0, v + step);
      t.relations[k as TribeId] = n;
    }
  }
}

export function relationLabel(v: number): string {
  if (v <= -50) return "hostile";
  if (v <= -15) return "wary";
  if (v < 15) return "neutral";
  return "friendly";
}

export function turnsAgo(now: number, then: number): string {
  const d = now - then;
  if (d <= 0) return "this turn";
  if (d === 1) return "last turn";
  return `${d} turns ago`;
}

import { CONTENT_VERSION, contentHash } from "@/content/index";
import { EVENT_BY_ID } from "@/content/events";
import { mockDecide } from "@/lib/game/mockPolicy";
import { buildDecisionContext, effectiveOption, resolveTurn, startGame, type TurnResult } from "@/lib/game/turn";
import { TRIBE_IDS, type GameState, type TribeId } from "@/lib/game/types";
import { createInitialState } from "@/lib/game/world/generate";

export function newGame(seed = "fixture", totalTurns = 50): GameState {
  return startGame(createInitialState(seed, CONTENT_VERSION, contentHash(), totalTurns));
}

export function optionFor(state: GameState, index = 0): string {
  const p = state.currentEvent!;
  return effectiveOption(p, EVENT_BY_ID[p.eventId]!.options[index % 3]!.id);
}

/** Advance one turn with the mock policy, or with explicit per-tribe candidate IDs. */
export function step(state: GameState, overrides: Partial<Record<TribeId, string | ((ids: string[]) => string)>> = {}, optionIndex = 0): TurnResult {
  const option = optionFor(state, optionIndex);
  const ctx = buildDecisionContext(state, option);
  const choices: Partial<Record<TribeId, string>> = {};
  for (const id of TRIBE_IDS) {
    const cands = ctx.candidates[id];
    if (!cands?.length) continue;
    const o = overrides[id];
    if (typeof o === "string") choices[id] = cands.some((c) => c.id === o) ? o : "rest";
    else if (typeof o === "function") choices[id] = o(cands.map((c) => c.id));
    else choices[id] = mockDecide(ctx.snapshot, id, cands).choice;
  }
  return resolveTurn(state, option, choices, ctx.candidates);
}

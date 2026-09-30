// Jev request DTO. Built only from canonical server records; the client can never supply prompt text.
// The DTO is separate from GameState so secrets, the supported tribe, and future events cannot leak.

import { BALANCE } from "@/content/balance";
import { TRIBES } from "@/content/tribes";
import type { TurnDecisionContext } from "@/lib/game/turn";
import type { ActionCandidate, TribeId } from "@/lib/game/types";
import { buildDecisionState, type DecisionState } from "@/lib/game/views";

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevRequest {
  model: string;
  state: DecisionState;
  questions: Record<string, ChoiceQuestion>;
}

export interface ExpectedQuestion {
  questionId: string;
  tribeId: TribeId;
  candidateIds: string[];
}

export interface BuiltRequest {
  request: JevRequest | null; // null when no tribe is alive
  expected: ExpectedQuestion[];
  estimatedInputTokens: number;
  trimLevel: number;
}

/** Authored instruction template (PRD §11.2); only validated game data is substituted. */
export function instructionFor(tribeId: TribeId): string {
  const name = TRIBES[tribeId].name;
  return (
    `Decide which one of the listed legal actions the ${name} community would prioritize this turn. ` +
    `Use its identity, needs, capabilities, recent experiences, and the announced environmental change. ` +
    `Favor survival and long-term prosperity while reflecting its preferences. ` +
    `Read its detailed situation at views.${tribeId} and the public world summary. ` +
    `Choose only from the provided actions. Other tribes decide simultaneously; their actions for this turn are unknown. ` +
    `Consider the stated costs and consequences rather than recalculating them. ` +
    `A tribe that falls below ${BALANCE.population.collapseBelow} people breaks apart, so a small or starving community may be wiser to accept a union offer from a much larger neighbour than to disappear.`
  );
}

export function questionId(tribeId: TribeId): string {
  return `decision_${tribeId}`;
}

function criterionText(c: ActionCandidate, trimLevel: number): string {
  let text = c.description;
  if (trimLevel < 2 && c.risks.length) text += ` Risks: ${c.risks.join("; ")}.`;
  return text;
}

/** Rough advisory estimate; the API's own validation and returned usage are authoritative. */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 3.6);
}

/** Target budget for our requests, well under the documented 32k (state + longest question) / 64k limits. */
export const TARGET_INPUT_TOKENS = 14_000;

export function buildJevRequest(ctx: TurnDecisionContext, model: string): BuiltRequest {
  const tribes = (Object.keys(ctx.candidates) as TribeId[]).filter((id) => (ctx.candidates[id]?.length ?? 0) > 0).sort();
  if (tribes.length === 0) return { request: null, expected: [], estimatedInputTokens: 0, trimLevel: 0 };
  // Deterministic trimming: drop old memories first, then optional risk text. Legal actions are never dropped.
  for (let trimLevel = 0; trimLevel <= 2; trimLevel++) {
    const state = buildDecisionState(ctx.snapshot, trimLevel === 0 ? 6 : 3);
    const questions: Record<string, ChoiceQuestion> = {};
    const expected: ExpectedQuestion[] = [];
    for (const id of tribes) {
      const cands = ctx.candidates[id] as ActionCandidate[];
      const criteria: Record<string, string> = {};
      for (const c of cands) criteria[c.id] = criterionText(c, trimLevel);
      questions[questionId(id)] = { type: "choice", instructions: instructionFor(id), criteria };
      expected.push({ questionId: questionId(id), tribeId: id, candidateIds: cands.map((c) => c.id) });
    }
    const request: JevRequest = { model, state, questions };
    const estimatedInputTokens = estimateTokens(request);
    if (estimatedInputTokens <= TARGET_INPUT_TOKENS || trimLevel === 2) return { request, expected, estimatedInputTokens, trimLevel };
  }
  throw new Error("unreachable");
}

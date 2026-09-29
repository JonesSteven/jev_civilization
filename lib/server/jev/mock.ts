import "server-only";
// Deterministic MOCK adapter for tests and keyless development. Explicitly labeled everywhere; a live
// game can never switch to it.

import type { TurnDecisionContext } from "@/lib/game/turn";
import { mockDecide } from "@/lib/game/mockPolicy";
import type { TribeId } from "@/lib/game/types";
import type { ExpectedQuestion } from "./request";
import { validateJevResponse, type ValidatedDecision } from "./validate";

export const MOCK_MODEL = "mock-policy-1 (not Jev)";

export function mockRespond(ctx: TurnDecisionContext, expected: ExpectedQuestion[]): { body: unknown; decisions: ValidatedDecision[] } {
  const answers: Record<string, unknown> = {};
  for (const q of expected) {
    const cands = ctx.candidates[q.tribeId as TribeId] ?? [];
    const a = mockDecide(ctx.snapshot, q.tribeId, cands);
    // Re-normalize after rounding so the mock passes the same validator as live output.
    const sum = Object.values(a.probabilities).reduce((s, v) => s + v, 0);
    const probabilities = Object.fromEntries(Object.entries(a.probabilities).map(([k, v]) => [k, v / sum]));
    answers[q.questionId] = { type: "choice", choice: a.choice, probabilities, confidence: a.confidence };
  }
  const body = { model: MOCK_MODEL, answers, usage: null, mock: true };
  return { body, decisions: validateJevResponse(body, expected) };
}

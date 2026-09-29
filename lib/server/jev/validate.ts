// Strict validation of Jev output (PRD §11.3). The highest-probability legal candidate is executed;
// nothing is sampled or overridden, and low confidence is diagnostic only.

import type { TribeId } from "@/lib/game/types";
import type { ExpectedQuestion } from "./request";

export const SUM_TOLERANCE = 0.01;

export interface ValidatedDecision {
  tribeId: TribeId;
  questionId: string;
  selected: string;
  returnedChoice: string | null;
  probabilities: Record<string, number>; // normalized
  rawProbabilities: Record<string, number>;
  confidence: number;
}

export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite01(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

export function validateJevResponse(body: unknown, expected: ExpectedQuestion[]): ValidatedDecision[] {
  if (!isRecord(body) || !isRecord(body.answers)) throw new InvalidResponseError("response has no answers object");
  const answers = body.answers;
  const expectedIds = new Set(expected.map((e) => e.questionId));
  for (const key of Object.keys(answers)) if (!expectedIds.has(key)) throw new InvalidResponseError(`unexpected question id ${key}`);

  return expected.map((q) => {
    const a = answers[q.questionId];
    if (!isRecord(a)) throw new InvalidResponseError(`missing answer for ${q.questionId}`);
    if (a.type !== "choice") throw new InvalidResponseError(`answer ${q.questionId} is not a choice`);
    if (!isRecord(a.probabilities)) throw new InvalidResponseError(`answer ${q.questionId} has no probabilities`);
    const offered = new Set(q.candidateIds);
    const raw: Record<string, number> = {};
    for (const [k, v] of Object.entries(a.probabilities)) {
      if (!offered.has(k)) throw new InvalidResponseError(`answer ${q.questionId} names unoffered option ${k}`);
      if (!finite01(v)) throw new InvalidResponseError(`answer ${q.questionId} has invalid probability for ${k}`);
      raw[k] = v;
    }
    for (const id of q.candidateIds) if (!(id in raw)) throw new InvalidResponseError(`answer ${q.questionId} omits option ${id}`);
    const sum = Object.values(raw).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1) > SUM_TOLERANCE) throw new InvalidResponseError(`answer ${q.questionId} probabilities sum to ${sum.toFixed(4)}`);
    if (!finite01(a.confidence)) throw new InvalidResponseError(`answer ${q.questionId} has invalid confidence`);
    const choice = a.choice === undefined || a.choice === null ? null : a.choice;
    if (choice !== null && (typeof choice !== "string" || !offered.has(choice))) throw new InvalidResponseError(`answer ${q.questionId} choice is not an offered option`);

    // Normalize only small rounding discrepancies; raw values are retained for inspection.
    const probabilities: Record<string, number> = {};
    for (const id of q.candidateIds) probabilities[id] = (raw[id] as number) / sum;
    const max = Math.max(...q.candidateIds.map((id) => probabilities[id] as number));
    const tied = q.candidateIds.filter((id) => probabilities[id] === max);
    let selected: string;
    if (choice !== null && tied.includes(choice)) selected = choice;
    else selected = [...tied].sort()[0] as string;
    if (choice !== null && (probabilities[choice] as number) < max - SUM_TOLERANCE) {
      throw new InvalidResponseError(`answer ${q.questionId} choice ${choice} is inconsistent with its probabilities`);
    }
    return { tribeId: q.tribeId, questionId: q.questionId, selected, returnedChoice: choice as string | null, probabilities, rawProbabilities: raw, confidence: a.confidence as number };
  });
}

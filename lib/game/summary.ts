// Plain-language summary of one turn: who gained or lost the most people, and why. Built only from measured
// outcomes (population before and after, and the causes the engine recorded), never from Jev's reasoning.

import { EVENT_BY_ID } from "@/content/events";
import { tribeName } from "@/content/tribes";
import { seasonOf } from "./calendar";
import { TRIBE_IDS, type GameOutcome, type GameState, type TribeId } from "./types";

export interface TribeChange {
  tribeId: TribeId;
  before: number;
  after: number;
  /** Signed share of the starting population gained or lost (−0.5 = lost half). */
  change: number;
  text: string;
  /** True when the headline already tells this tribe's story. */
  inHeadline?: boolean;
}

export interface TurnSummary {
  headline: string;
  lines: TribeChange[];
}

/** Changes smaller than this share of a tribe's people are not worth a line. */
export const NOTABLE_CHANGE = 0.05;

const LOSS_CAUSES: Record<string, string> = {
  starvation: "hunger",
  exposure: "cold",
  epidemic: "sickness",
  raid_losses: "fighting",
  recruited_away: "a neighbour that lured people away",
};
const GAIN_CAUSES: Record<string, string> = {
  births: "births",
  recruit: "newcomers",
};

export function shareOfPeople(r: number): string {
  if (r >= 0.9) return "nearly all of its people";
  if (r >= 0.72) return "three quarters of its people";
  if (r >= 0.6) return "two thirds of its people";
  if (r >= 0.45) return "half of its people";
  if (r >= 0.3) return "a third of its people";
  if (r >= 0.22) return "a quarter of its people";
  if (r >= 0.17) return "a fifth of its people";
  return `${Math.max(1, Math.round(r * 100))}% of its people`;
}

export function growthPhrase(r: number): string {
  if (r >= 1.9) return `nearly tripled`;
  if (r >= 0.95) return "doubled in size";
  if (r >= 0.45) return "grew by half";
  if (r >= 0.3) return "grew by a third";
  if (r >= 0.22) return "grew by a quarter";
  return `grew by ${Math.max(1, Math.round(r * 100))}%`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Causes of a tribe's losses (or gains), largest first. */
function causes(outcomes: GameOutcome[], id: TribeId, sign: -1 | 1): string[] {
  const table = sign < 0 ? LOSS_CAUSES : GAIN_CAUSES;
  const totals = new Map<string, number>();
  for (const o of outcomes) {
    const n = o.amounts?.population ?? 0;
    if (o.tribeId !== id || n * sign <= 0) continue;
    const label = table[o.kind];
    if (label) totals.set(label, (totals.get(label) ?? 0) + Math.abs(n));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function inArea(state: GameState, id: TribeId, footprint: number[] | null): boolean {
  if (footprint === null) return true;
  const t = state.tribes[id];
  return [t.settlement, ...t.outposts].some((x) => footprint.includes(x));
}

/**
 * Summarize one resolved turn. `pre` is the state before the turn, `next` the state after, and `outcomes` the
 * turn's measured outcomes. The event line names the environmental choice when a notable tribe sat inside its area.
 */
export function summarizeTurn(pre: GameState, next: GameState, outcomes: GameOutcome[], eventId: string, optionId: string, footprint: number[] | null): TurnSummary {
  const event = EVENT_BY_ID[eventId];
  const option = event?.options.find((o) => o.id === optionId);
  const tone = option?.tone ?? "mild";
  const eventName = option ? (option.cause ?? option.label.toLowerCase()) : "season";
  const regional = event ? event.footprint.kind !== "world" : false;
  const winter = seasonOf(pre.completedTurn + 1) === "winter";
  const lines: TribeChange[] = [];
  const departures: string[] = [];

  for (const id of TRIBE_IDS) {
    const a = pre.tribes[id];
    const b = next.tribes[id];
    if (!a.alive) continue;
    const before = a.population;
    const name = tribeName(id);
    if (!b.alive) {
      let text: string;
      if (b.fate === "joined" && b.absorbedBy) text = `${name} joined ${tribeName(b.absorbedBy)}, ending its own story.`;
      else if (b.fate === "conquered" && b.absorbedBy) text = `${name} was conquered by ${tribeName(b.absorbedBy)}.`;
      else text = `${name} was wiped out: its last people scattered.`;
      departures.push(text);
      lines.push({ tribeId: id, before, after: 0, change: -1, text });
      continue;
    }
    const after = b.population;
    const change = before > 0 ? (after - before) / before : 0;
    if (Math.abs(change) < NOTABLE_CHANGE) continue;
    const hit = inArea(pre, id, footprint);
    if (change < 0) {
      const why = causes(outcomes, id, -1);
      // Credit the environment only for losses it can cause (hunger, cold, sickness) inside its area.
      const natural = why[0] === "hunger" || why[0] === "cold" || why[0] === "sickness";
      const lead = hit && natural && tone === "harsh" ? `Hit by the ${eventName}, ` : "";
      const lean = !lead && why[0] === "hunger" && winter ? " as winter stores ran low" : "";
      const text = `${lead}${name} lost ${shareOfPeople(-change)}${why.length ? ` to ${joinWords(why.slice(0, 2))}` : ""}${lean} (${before.toLocaleString("en-US")} → ${after.toLocaleString("en-US")}).`;
      lines.push({ tribeId: id, before, after, change, text: text.charAt(0).toUpperCase() + text.slice(1) });
    } else {
      const absorbed = outcomes.find((o) => o.tribeId === id && (o.kind === "union_gain" || o.kind === "conquest_gain"));
      const why = absorbed ? [] : causes(outcomes, id, 1);
      const lead = !absorbed && hit && regional && tone === "beneficial" ? `Helped by the ${eventName}, ` : "";
      const reason = absorbed ? " by taking in another tribe" : why.includes("newcomers") ? " with newcomers from a struggling neighbour" : why.includes("births") ? " on plentiful food" : "";
      const text = `${lead}${name} ${growthPhrase(change)}${reason} (${before.toLocaleString("en-US")} → ${after.toLocaleString("en-US")}).`;
      lines.push({ tribeId: id, before, after, change, text: text.charAt(0).toUpperCase() + text.slice(1) });
    }
  }

  lines.sort((x, y) => Math.abs(y.change) - Math.abs(x.change) || TRIBE_IDS.indexOf(x.tribeId) - TRIBE_IDS.indexOf(y.tribeId));
  const title = option ? option.label : "The season";
  let headline: string;
  if (departures.length) {
    headline = departures.join(" ");
    for (const l of lines) if (l.change === -1 && l.after === 0) l.inHeadline = true;
  } else {
    const loser = lines.find((l) => l.change < 0);
    const gainer = lines.find((l) => l.change > 0);
    if (loser) loser.inHeadline = true;
    if (gainer) gainer.inHeadline = true;
    const clause = (l: TribeChange) => l.text.replace(/ \([\d,]+ → [\d,]+\)\.$/, "");
    if (loser && gainer) headline = `${clause(loser)}, while ${clause(gainer).replace(/^(Helped by [^,]+, )?/, (m) => m.toLowerCase())}.`;
    else if (loser) headline = `${clause(loser)}.`;
    else if (gainer) headline = `${clause(gainer)}.`;
    else headline = `${title}: a quiet turn. No tribe gained or lost more than ${Math.round(NOTABLE_CHANGE * 100)}% of its people.`;
  }
  return { headline, lines };
}

// Headless balance smoke test: run seeded full matches with the MOCK policy (not Jev).
// Usage: npm run simulate -- --games 100 [--turns 100] [--seed-prefix sim] [--verbose]
// Reports per-tribe results plus "drama" metrics: how far apart the tribes end up, how often a tribe is
// wiped out, conquered, or joins another, and how often one tribe is left standing.
import { CONTENT_VERSION, contentHash } from "@/content/index";
import { EVENT_BY_ID } from "@/content/events";
import { TRIBE_IDS, type TribeId } from "@/lib/game/types";
import { createInitialState } from "@/lib/game/world/generate";
import { buildDecisionContext, currentScores, effectiveOption, isMatchOver, resolveTurn, startGame } from "@/lib/game/turn";
import { mockDecide } from "@/lib/game/mockPolicy";
import { makeRng } from "@/lib/game/rng";
import { winners } from "@/lib/game/score";
import { DEFAULT_TOTAL_TURNS } from "@/lib/game/calendar";

const args = process.argv.slice(2);
const games = Number(args[args.indexOf("--games") + 1] ?? 10) || 10;
const prefix = args.includes("--seed-prefix") ? String(args[args.indexOf("--seed-prefix") + 1]) : "sim";
const verbose = args.includes("--verbose");
/** Print each turn's event and plain-language summary (use with a small --games). */
const story = args.includes("--story");
const turns = args.includes("--turns") ? Number(args[args.indexOf("--turns") + 1]) : DEFAULT_TOTAL_TURNS;
const checkpoints = [...new Set([Math.min(25, turns), Math.min(50, turns), turns])];

const wins: Record<string, number> = {};
const survival: Record<string, number> = {};
const actionFreq: Record<string, Record<string, number>> = {};
const finalPop: Record<string, number[]> = {};
const finalScore: Record<string, number[]> = {};
const techs: Record<string, number[]> = {};
const fates: Record<string, Record<string, number>> = {};
let crashes = 0;
let maxTurnMs = 0;
let totalTurnMs = 0;
let turnsRun = 0;
for (const id of TRIBE_IDS) { survival[id] = 0; actionFreq[id] = {}; finalPop[id] = []; finalScore[id] = []; techs[id] = []; fates[id] = {}; }

/** Largest living population ÷ smallest living population (Infinity once any tribe is gone). */
const spreadAt: Record<number, number[]> = {};
for (const c of checkpoints) spreadAt[c] = [];
const livingSpreadAt: Record<number, number[]> = {};
for (const c of checkpoints) livingSpreadAt[c] = [];
/** People gained or lost per cause, summed over every game (outcome kind → total). */
const causeTotals: Record<string, number> = {};
const firstLossTurn: number[] = [];
let gamesWithLoss = 0;
let gamesWithUnion = 0;
let gamesWithConquest = 0;
let gamesWithCollapse = 0;
let gamesWithTwoGone = 0;
const lastStandingTurn: number[] = [];

for (let g = 0; g < games; g++) {
  const seed = `${prefix}-${g}`;
  try {
    let state = startGame(createInitialState(seed, CONTENT_VERSION, contentHash(), turns));
    let firstLoss: number | null = null;
    for (let turn = 1; turn <= turns && !isMatchOver(state); turn++) {
      const prepared = state.currentEvent!;
      const playerPick = prepared.source === "player" ? makeRng(seed, "mock", "player", turn).pick([0, 1, 2]) : 0;
      const optionId = effectiveOption(prepared, EVENT_BY_ID[prepared.eventId]!.options[playerPick]!.id);
      const t0 = performance.now();
      const ctx = buildDecisionContext(state, optionId);
      const choices: Partial<Record<TribeId, string>> = {};
      for (const id of TRIBE_IDS) {
        const cands = ctx.candidates[id];
        if (!cands || cands.length === 0) continue;
        const ans = mockDecide(ctx.snapshot, id, cands);
        choices[id] = ans.choice;
        const kind = cands.find((c) => c.id === ans.choice)!.kind;
        actionFreq[id]![kind] = (actionFreq[id]![kind] ?? 0) + 1;
      }
      const res = resolveTurn(state, optionId, choices, ctx.candidates);
      const ms = performance.now() - t0;
      maxTurnMs = Math.max(maxTurnMs, ms); totalTurnMs += ms; turnsRun++;
      state = res.state;
      if (res.eliminated.length && firstLoss === null) firstLoss = turn;
      for (const o of res.outcomes) {
        const n = o.amounts?.population ?? 0;
        if (n !== 0) causeTotals[o.kind] = (causeTotals[o.kind] ?? 0) + n;
      }
      if (story) {
        const ev = EVENT_BY_ID[prepared.eventId]!;
        const opt = ev.options.find((o) => o.id === optionId)!;
        const pops = TRIBE_IDS.map((id) => `${id.slice(0, 5)} ${state.tribes[id].alive ? state.tribes[id].population : "—"}`).join(" · ");
        console.log(`T${turn} ${ev.title}: ${opt.label} @ ${prepared.footprintLabel} [${pops}]\n    ${res.summary.headline}`);
        for (const l of res.summary.lines.filter((x) => !x.inHeadline)) console.log(`      ${l.text}`);
      }
      if (verbose && (turn % 10 === 0 || res.eliminated.length)) {
        console.log(seed, turn, TRIBE_IDS.map((id) => `${id.slice(0, 5)}:${state.tribes[id].alive ? state.tribes[id].population : state.tribes[id].fate}`).join(" "));
      }
      for (const id of TRIBE_IDS) {
        const t = state.tribes[id];
        if (t.population < 0 || t.food < 0 || t.timber < 0 || t.stone < 0) throw new Error(`negative stock ${id} turn ${turn}`);
      }
      for (const c of checkpoints) {
        if (turn !== c && !(isMatchOver(state) && turn < c)) continue;
        const pops = TRIBE_IDS.map((id) => (state.tribes[id].alive ? state.tribes[id].population : 0));
        const min = Math.min(...pops);
        spreadAt[c]!.push(min <= 0 ? Infinity : Math.max(...pops) / min);
        const living = pops.filter((p) => p > 0);
        if (living.length >= 2) livingSpreadAt[c]!.push(Math.max(...living) / Math.min(...living));
      }
    }
    const scores = currentScores(state);
    for (const w of winners(scores)) wins[w] = (wins[w] ?? 0) + 1;
    const gameFates = new Set<string>();
    for (const id of TRIBE_IDS) {
      const t = state.tribes[id];
      if (t.alive) survival[id]!++;
      else {
        const f = t.fate ?? "collapsed";
        fates[id]![f] = (fates[id]![f] ?? 0) + 1;
        gameFates.add(f);
      }
      finalPop[id]!.push(t.population);
      finalScore[id]!.push(scores[id].total);
      techs[id]!.push(t.learned.length);
    }
    if (firstLoss !== null) { gamesWithLoss++; firstLossTurn.push(firstLoss); }
    if (gameFates.has("joined")) gamesWithUnion++;
    if (gameFates.has("conquered")) gamesWithConquest++;
    if (gameFates.has("collapsed")) gamesWithCollapse++;
    if (TRIBE_IDS.filter((id) => !state.tribes[id].alive).length >= 2) gamesWithTwoGone++;
    if (TRIBE_IDS.filter((id) => state.tribes[id].alive).length <= 1) lastStandingTurn.push(state.completedTurn);
  } catch (e) {
    crashes++;
    console.error(`CRASH seed=${seed}:`, e);
  }
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n: number) => `${Math.round((n / Math.max(1, games)) * 100)}%`;
const quantile = (a: number[], q: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};
const fmt = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)}×` : "gone");

console.log(`\nMOCK-policy simulation: ${games} games × ${turns} turns, crashes ${crashes}`);
console.log(`Engine resolution per turn: avg ${(totalTurnMs / Math.max(1, turnsRun)).toFixed(1)} ms, max ${maxTurnMs.toFixed(1)} ms`);
for (const id of TRIBE_IDS) {
  const top = Object.entries(actionFreq[id]!).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(" ");
  const f = Object.entries(fates[id]!).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`${id.padEnd(11)} wins ${String(wins[id] ?? 0).padStart(3)} survive ${String(survival[id]).padStart(3)} pop ${avg(finalPop[id]!).toFixed(0).padStart(5)} score ${avg(finalScore[id]!).toFixed(1).padStart(5)} techs ${avg(techs[id]!).toFixed(1)}${f ? ` [${f}]` : ""} | ${top}`);
}
console.log(`\nDrama`);
for (const c of checkpoints) {
  const a = spreadAt[c]!;
  const atLeast4 = a.filter((v) => v >= 4).length;
  const atLeast8 = a.filter((v) => v >= 8).length;
  const l = livingSpreadAt[c]!;
  console.log(`  turn ${String(c).padStart(3)}: largest ÷ smallest  p25 ${fmt(quantile(a, 0.25))}  median ${fmt(quantile(a, 0.5))}  p75 ${fmt(quantile(a, 0.75))}   ≥4× or gone: ${pct(atLeast4)}, ≥8× or gone: ${pct(atLeast8)}   (living only: median ${fmt(quantile(l, 0.5))}, p75 ${fmt(quantile(l, 0.75))})`);
}
console.log(`  games losing a tribe: ${pct(gamesWithLoss)} (first loss: median turn ${quantile(firstLossTurn, 0.5)}, before turn 15 in ${pct(firstLossTurn.filter((t) => t < 15).length)})`);
console.log(`  games with a collapse ${pct(gamesWithCollapse)}, a conquest ${pct(gamesWithConquest)}, a union ${pct(gamesWithUnion)}; two or more tribes gone ${pct(gamesWithTwoGone)}`);
console.log(`  people per game by cause: ${Object.entries(causeTotals).sort((x, y) => x[1] - y[1]).map(([k, v]) => `${k} ${Math.round(v / Math.max(1, games))}`).join(", ")}`);
console.log(`  one tribe left standing: ${pct(lastStandingTurn.length)}${lastStandingTurn.length ? ` (median turn ${quantile(lastStandingTurn, 0.5)})` : ""}`);
if (crashes > 0) process.exit(1);

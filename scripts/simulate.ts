// Headless balance smoke test: run seeded full matches with the MOCK policy (not Jev).
// Usage: npm run simulate -- --games 100 [--turns 50] [--seed-prefix sim] [--verbose]
import { CONTENT_VERSION, contentHash } from "@/content/index";
import { TRIBE_IDS, type TribeId } from "@/lib/game/types";
import { createInitialState } from "@/lib/game/world/generate";
import { buildDecisionContext, effectiveOption, resolveTurn, startGame } from "@/lib/game/turn";
import { mockDecide } from "@/lib/game/mockPolicy";
import { makeRng } from "@/lib/game/rng";
import { winners } from "@/lib/game/score";
import { DEFAULT_TOTAL_TURNS } from "@/lib/game/calendar";

const args = process.argv.slice(2);
const games = Number(args[args.indexOf("--games") + 1] ?? 10) || 10;
const prefix = args.includes("--seed-prefix") ? String(args[args.indexOf("--seed-prefix") + 1]) : "sim";
const verbose = args.includes("--verbose");
const turns = args.includes("--turns") ? Number(args[args.indexOf("--turns") + 1]) : DEFAULT_TOTAL_TURNS;

const wins: Record<string, number> = {};
const survival: Record<string, number> = {};
const actionFreq: Record<string, Record<string, number>> = {};
const finalPop: Record<string, number[]> = {};
const finalScore: Record<string, number[]> = {};
const techs: Record<string, number[]> = {};
let crashes = 0;
let maxTurnMs = 0;
let totalTurnMs = 0;
let turnsRun = 0;
for (const id of TRIBE_IDS) { survival[id] = 0; actionFreq[id] = {}; finalPop[id] = []; finalScore[id] = []; techs[id] = []; }

for (let g = 0; g < games; g++) {
  const seed = `${prefix}-${g}`;
  try {
    let state = startGame(createInitialState(seed, CONTENT_VERSION, contentHash(), turns));
    for (let turn = 1; turn <= turns; turn++) {
      const prepared = state.currentEvent!;
      const playerPick = prepared.source === "player" ? makeRng(seed, "mock", "player", turn).pick([0, 1, 2]) : 0;
      const { EVENT_BY_ID } = await import("@/content/events");
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
      if (verbose && turn % 10 === 0) console.log(seed, turn, TRIBE_IDS.map((id) => `${id}:${state.tribes[id].population}/${state.tribes[id].food}`).join(" "));
      for (const id of TRIBE_IDS) {
        const t = state.tribes[id];
        if (t.population < 0 || t.food < 0 || t.timber < 0 || t.stone < 0) throw new Error(`negative stock ${id} turn ${turn}`);
      }
    }
    const { currentScores } = await import("@/lib/game/turn");
    const scores = currentScores(state);
    for (const w of winners(scores)) wins[w] = (wins[w] ?? 0) + 1;
    for (const id of TRIBE_IDS) {
      if (state.tribes[id].alive) survival[id]!++;
      finalPop[id]!.push(state.tribes[id].population);
      finalScore[id]!.push(scores[id].total);
      techs[id]!.push(state.tribes[id].learned.length);
    }
  } catch (e) {
    crashes++;
    console.error(`CRASH seed=${seed}:`, e);
  }
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
console.log(`\nMOCK-policy simulation: ${games} games × ${turns} turns, crashes ${crashes}`);
console.log(`Engine resolution per turn: avg ${(totalTurnMs / Math.max(1, turnsRun)).toFixed(1)} ms, max ${maxTurnMs.toFixed(1)} ms`);
for (const id of TRIBE_IDS) {
  const top = Object.entries(actionFreq[id]!).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`${id.padEnd(11)} wins ${String(wins[id] ?? 0).padStart(3)} survive ${String(survival[id]).padStart(3)} pop ${avg(finalPop[id]!).toFixed(0).padStart(4)} score ${avg(finalScore[id]!).toFixed(1).padStart(5)} techs ${avg(techs[id]!).toFixed(1)} | ${top}`);
}
if (crashes > 0) process.exit(1);

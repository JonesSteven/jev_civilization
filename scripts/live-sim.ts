// Full matches decided by the REAL Jev model (costs one Jev request per turn). The player's environmental
// choices are seeded random picks. Prints a per-turn trace and the same drama metrics as `npm run simulate`.
// Usage: npm run live-sim -- --games 3 --turns 100 [--seed-prefix live] [--parallel 3] [--quiet]
// Never prints the API key.
import fs from "node:fs";
import { CONTENT_VERSION, contentHash } from "@/content/index";
import { EVENT_BY_ID } from "@/content/events";
import { TRIBE_IDS, type TribeId } from "@/lib/game/types";
import { createInitialState } from "@/lib/game/world/generate";
import { buildDecisionContext, currentScores, effectiveOption, isMatchOver, resolveTurn, startGame } from "@/lib/game/turn";
import { makeRng } from "@/lib/game/rng";
import { winners } from "@/lib/game/score";
import { buildJevRequest } from "@/lib/server/jev/request";
import { validateJevResponse } from "@/lib/server/jev/validate";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
    }
  }
}
loadEnv();
const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error("TYPESAFE_API_KEY is not set; cannot run live games.");
  process.exit(2);
}
const model = process.env.JEV_MODEL || "jev-1.13.0";
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => (args.includes(name) ? String(args[args.indexOf(name) + 1]) : fallback);
const games = Number(arg("--games", "1"));
const turns = Number(arg("--turns", "100"));
const prefix = arg("--seed-prefix", "live");
const parallel = Math.max(1, Number(arg("--parallel", "1")));
const quiet = args.includes("--quiet");

async function decide(body: unknown, expected: Parameters<typeof validateJevResponse>[1]) {
  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw new Error(lastError);
      }
      const json = JSON.parse(text) as { usage?: { input_tokens?: number; output_tokens?: number } };
      return { decisions: validateJevResponse(json, expected), tokens: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) };
    } catch (e) {
      lastError = String(e);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`Jev failed after retries: ${lastError}`);
}

interface GameResult {
  seed: string;
  log: string[];
  spread: Record<number, number>;
  fates: Partial<Record<TribeId, string>>;
  finalPop: Record<TribeId, number>;
  winners: TribeId[];
  endTurn: number;
  tokens: number;
  actions: Record<string, number>;
}

const checkpoints = [...new Set([Math.min(25, turns), Math.min(50, turns), turns])];

async function playGame(seed: string): Promise<GameResult> {
  let state = startGame(createInitialState(seed, CONTENT_VERSION, contentHash(), turns));
  const log: string[] = [];
  const spread: Record<number, number> = {};
  let tokens = 0;
  const actions: Record<string, number> = {};
  for (let turn = 1; turn <= turns && !isMatchOver(state); turn++) {
    const prepared = state.currentEvent!;
    const ev = EVENT_BY_ID[prepared.eventId]!;
    const pick = prepared.source === "player" ? makeRng(seed, "mock", "player", turn).pick([0, 1, 2]) : 0;
    const optionId = effectiveOption(prepared, ev.options[pick]!.id);
    const ctx = buildDecisionContext(state, optionId);
    const built = buildJevRequest(ctx, model);
    const choices: Partial<Record<TribeId, string>> = {};
    let picks = "";
    if (built.request) {
      const { decisions, tokens: used } = await decide(built.request, built.expected);
      tokens += used;
      for (const d of decisions) {
        choices[d.tribeId] = d.selected;
        const kind = ctx.candidates[d.tribeId]?.find((c) => c.id === d.selected)?.kind ?? "?";
        actions[`${d.tribeId}:${kind}`] = (actions[`${d.tribeId}:${kind}`] ?? 0) + 1;
        picks += ` ${d.tribeId.slice(0, 5)}:${d.selected}`;
      }
    }
    const res = resolveTurn(state, optionId, choices, ctx.candidates);
    state = res.state;
    const opt = ev.options.find((o) => o.id === optionId)!;
    const pops = TRIBE_IDS.map((id) => `${id.slice(0, 5)} ${state.tribes[id].alive ? state.tribes[id].population : "—"}`).join(" · ");
    log.push(`T${turn} ${prepared.source === "player" ? "p" : "n"} ${ev.title}: ${opt.label} @ ${prepared.footprintLabel} [${pops}] |${picks}`);
    log.push(`    ${res.summary.headline}`);
    for (const l of res.summary.lines.filter((x) => !x.inHeadline)) log.push(`      ${l.text}`);
    if (!quiet) console.log(`[${seed}] T${turn} ${ev.title}: ${opt.label} [${pops}]\n[${seed}]     ${res.summary.headline}`);
    for (const c of checkpoints) {
      if (turn !== c && !(isMatchOver(state) && turn < c)) continue;
      const p = TRIBE_IDS.map((id) => (state.tribes[id].alive ? state.tribes[id].population : 0));
      const min = Math.min(...p);
      spread[c] = min <= 0 ? Infinity : Math.max(...p) / min;
    }
  }
  const fates: Partial<Record<TribeId, string>> = {};
  const finalPop = {} as Record<TribeId, number>;
  for (const id of TRIBE_IDS) {
    const t = state.tribes[id];
    finalPop[id] = t.population;
    if (!t.alive) fates[id] = `${t.fate === "joined" ? `joined ${t.absorbedBy}` : t.fate === "conquered" ? `conquered by ${t.absorbedBy}` : "collapsed"} on turn ${t.eliminatedTurn}`;
  }
  return { seed, log, spread, fates, finalPop, winners: winners(currentScores(state)), endTurn: state.completedTurn, tokens, actions };
}

const seeds = Array.from({ length: games }, (_, i) => `${prefix}-${i}`);
const results: GameResult[] = [];
for (let i = 0; i < seeds.length; i += parallel) {
  const batch = await Promise.all(seeds.slice(i, i + parallel).map((s) => playGame(s)));
  results.push(...batch);
}

const fmt = (v: number | undefined) => (v === undefined ? "?" : Number.isFinite(v) ? `${v.toFixed(1)}×` : "gone");
console.log(`\nLIVE Jev simulation (${model}): ${games} games × up to ${turns} turns`);
for (const r of results) {
  console.log(`\n=== ${r.seed}: ended turn ${r.endTurn}, ${Math.round(r.tokens / 1000)}k tokens; winners ${r.winners.join(", ") || "none"}`);
  console.log(`  final population: ${TRIBE_IDS.map((id) => `${id} ${r.finalPop[id]}`).join(", ")}`);
  console.log(`  spread (largest ÷ smallest): ${checkpoints.map((c) => `t${c} ${fmt(r.spread[c])}`).join(", ")}`);
  if (Object.keys(r.fates).length) console.log(`  departures: ${Object.entries(r.fates).map(([k, v]) => `${k} ${v}`).join("; ")}`);
  const top = Object.entries(r.actions).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`  most chosen: ${top}`);
}
const outDir = "reports";
if (fs.existsSync(outDir)) {
  for (const r of results) fs.writeFileSync(`${outDir}/live-${r.seed}-${turns}.log`, r.log.join("\n") + "\n");
  console.log(`\nTurn-by-turn logs written to ${outDir}/live-<seed>-${turns}.log`);
}

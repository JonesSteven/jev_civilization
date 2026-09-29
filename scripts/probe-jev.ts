// One-off live contract probe (costs one small Jev request). Builds a real turn-1 batch from a seeded world,
// sends it to the fixed TypeSafe endpoint, validates the answer, and prints usage/latency. Never prints the key.
// Usage: npm run probe:jev [-- --seed demo]
import fs from "node:fs";
import { CONTENT_VERSION, contentHash } from "@/content/index";
import { EVENT_BY_ID } from "@/content/events";
import { createInitialState } from "@/lib/game/world/generate";
import { buildDecisionContext, effectiveOption, startGame } from "@/lib/game/turn";
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
  console.error("TYPESAFE_API_KEY is not set; cannot probe live Jev.");
  process.exit(2);
}
const model = process.env.JEV_MODEL || "jev-1.13.0";
const args = process.argv.slice(2);
const seed = args.includes("--seed") ? String(args[args.indexOf("--seed") + 1]) : "probe";

const state = startGame(createInitialState(seed, CONTENT_VERSION, contentHash()));
const p = state.currentEvent!;
const ctx = buildDecisionContext(state, effectiveOption(p, EVENT_BY_ID[p.eventId]!.options[0]!.id));
const built = buildJevRequest(ctx, model);
console.log(`Request: ${built.expected.length} choice questions, ~${built.estimatedInputTokens} estimated tokens (advisory).`);
const t0 = Date.now();
const res = await fetch("https://api.typesafe.ai/v1/systemone", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify(built.request),
  cache: "no-store",
});
const text = await res.text();
console.log(`HTTP ${res.status} in ${Date.now() - t0} ms; request id ${res.headers.get("x-typesafe-request-id")}`);
if (!res.ok) {
  console.log(text.slice(0, 500));
  process.exit(1);
}
const body = JSON.parse(text);
console.log(`Resolved model: ${body.model}; usage: ${JSON.stringify(body.usage)}`);
const decisions = validateJevResponse(body, built.expected);
for (const d of decisions) {
  const top = Object.entries(d.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(", ");
  console.log(`${d.tribeId.padEnd(11)} → ${d.selected} (confidence ${d.confidence.toFixed(2)}); top: ${top}`);
}

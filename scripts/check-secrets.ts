// Secret-leak check (AC19): scans the production build, git-tracked files, and the local database for the
// configured API key. Prints only counts and file names, never the key.
// Usage: npm run check:secrets  (run after `npm run build`)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

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
if (!key || key.length < 16) {
  console.log("No TYPESAFE_API_KEY configured; nothing to scan for.");
  process.exit(0);
}
// Search for a distinctive middle fragment so partial copies are caught too.
const needle = key.slice(Math.floor(key.length / 3), Math.floor(key.length / 3) + 24);
const hits: string[] = [];

function scanFile(file: string) {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return;
  }
  if (buf.includes(needle)) hits.push(file);
}

function walk(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "cache") continue;
      walk(p);
    } else scanFile(p);
  }
}

walk(".next/static");
walk(".next/server");
let tracked: string[] = [];
try {
  tracked = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  tracked = [];
}
for (const f of tracked) scanFile(f);

let dbHits = 0;
const dbPath = process.env.DATABASE_PATH ?? "./data/jevciv.sqlite";
if (fs.existsSync(dbPath)) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  for (const t of ["games", "turn_intents", "turns", "keyframes", "model_attempts", "sessions"]) {
    for (const row of db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]) {
      for (const v of Object.values(row)) {
        let text = "";
        if (v instanceof Uint8Array) {
          try {
            text = gunzipSync(v).toString();
          } catch {
            text = Buffer.from(v).toString();
          }
        } else text = String(v);
        if (text.includes(needle)) dbHits++;
      }
    }
  }
}

console.log(`Scanned .next/static, .next/server, ${tracked.length} committable files, and ${fs.existsSync(dbPath) ? dbPath : "no database"}.`);
if (hits.length || dbHits) {
  console.error(`API key found in ${hits.length} file(s)${hits.length ? `: ${hits.join(", ")}` : ""} and ${dbHits} database value(s).`);
  process.exit(1);
}
console.log("No API key material found.");

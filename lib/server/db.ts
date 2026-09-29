import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import { getConfig } from "./config";
import { MIGRATIONS } from "./migrations";

type Holder = { db: DatabaseSync | null; path: string | null };
const g = globalThis as unknown as { __jevcivDb?: Holder };
const holder: Holder = (g.__jevcivDb ??= { db: null, path: null });

export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null } | undefined;
  const current = row?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(m.version, Date.now());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

export function getDb(): DatabaseSync {
  const file = getConfig().databasePath;
  if (!holder.db || holder.path !== file) {
    holder.db = openDatabase(file);
    holder.path = file;
  }
  return holder.db;
}

/** Tests can swap in an isolated database. */
export function setDbForTests(db: DatabaseSync | null) {
  holder.db = db;
  holder.path = db ? getConfig().databasePath : null;
}

/** Short synchronous write transaction. Never await inside: no network call may hold it open. */
export function tx<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn(db);
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // already rolled back
    }
    throw e;
  }
}

export function packJson(value: unknown): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(JSON.stringify(value)), { level: 6 }));
}

export function unpackJson<T>(blob: Uint8Array | Buffer | null | undefined): T {
  if (!blob) throw new Error("missing blob");
  return JSON.parse(gunzipSync(Buffer.from(blob)).toString("utf8")) as T;
}

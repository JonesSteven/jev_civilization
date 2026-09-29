import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { getConfig } from "./config";
import { ApiError } from "./http";

/** Counts persist in SQLite so limits survive process restarts. */
function countSince(db: DatabaseSync, sessionId: string, kind: string, since: number): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM rate_events WHERE session_id = ? AND kind = ? AND at >= ?").get(sessionId, kind, since) as { n: number };
  return row.n;
}

export function checkAndRecordGameCreation(db: DatabaseSync, sessionId: string) {
  const now = Date.now();
  if (countSince(db, sessionId, "game", now - 3_600_000) >= getConfig().limits.gamesPerHour) {
    throw new ApiError(429, "rate_limited_games", "Too many new games this hour. Please wait before starting another.");
  }
  db.prepare("INSERT INTO rate_events (session_id, kind, at) VALUES (?, 'game', ?)").run(sessionId, now);
}

export function checkAndRecordTurnStart(db: DatabaseSync, sessionId: string) {
  const now = Date.now();
  if (countSince(db, sessionId, "turn", now - 60_000) >= getConfig().limits.turnStartsPerMinute) {
    throw new ApiError(429, "rate_limited_turns", "Too many turns started this minute. Please wait a moment.");
  }
  db.prepare("INSERT INTO rate_events (session_id, kind, at) VALUES (?, 'turn', ?)").run(sessionId, now);
  db.prepare("DELETE FROM rate_events WHERE at < ?").run(now - 86_400_000);
}

/** Process-level provider concurrency (default 4). One module owns this policy. */
class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: () => number) {}
  async acquire(): Promise<() => void> {
    if (this.active >= this.max()) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.queue.shift()?.();
    };
  }
}

const g = globalThis as unknown as { __jevcivSem?: Semaphore };
export const providerSemaphore: Semaphore = (g.__jevcivSem ??= new Semaphore(() => getConfig().maxConcurrency));

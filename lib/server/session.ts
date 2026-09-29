import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getConfig } from "./config";
import { getDb } from "./db";

export const SESSION_COOKIE = "jc_session";
const MAX_AGE = 60 * 60 * 24 * 180;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface Session {
  id: string;
  /** Present only when a new cookie must be set on the response. */
  newToken: string | null;
}

/** Resolve the anonymous session from its opaque cookie; optionally create one. Only the token hash is stored. */
export function resolveSession(req: NextRequest, create: boolean): Session | null {
  const db = getDb();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && /^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    const row = db.prepare("SELECT id FROM sessions WHERE token_hash = ?").get(hashToken(token)) as { id: string } | undefined;
    if (row) {
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(Date.now(), row.id);
      return { id: row.id, newToken: null };
    }
  }
  if (!create) return null;
  const newToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO sessions (id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)").run(id, hashToken(newToken), now, now);
  return { id, newToken };
}

export function applySessionCookie(res: NextResponse, session: Session | null) {
  if (!session?.newToken) return res;
  res.cookies.set(SESSION_COOKIE, session.newToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().production,
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

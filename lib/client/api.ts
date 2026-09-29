"use client";
import type { ApiErrorBody, GameView, ReplayData, TurnRecord } from "./types";

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
    readonly game: GameView | null = null,
  ) {
    super(body.message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const errBody = (data as { error?: ApiErrorBody } | null)?.error;
  if (!res.ok || errBody) {
    throw new ClientApiError(res.status, errBody ?? { code: "http_error", message: `Request failed (${res.status}).` }, (data as { game?: GameView } | null)?.game ?? null);
  }
  return { status: res.status, data: data as T };
}

export const api = {
  config: () => call<{ liveAvailable: boolean; mockPermitted: boolean; model: string }>("GET", "/api/config").then((r) => r.data),
  listGames: () =>
    call<{ games: { id: string; status: string; mode: string; supportedTribeId: string; seed: string; completedTurn: number; totalTurns: number; createdAt: number }[] }>("GET", "/api/games").then(
      (r) => r.data.games,
    ),
  createGame: (body: { tribeId: string; seed?: string; mode: "live" | "mock"; totalTurns?: number }) => call<{ game: GameView }>("POST", "/api/games", body).then((r) => r.data.game),
  getGame: (id: string) => call<{ game: GameView }>("GET", `/api/games/${id}`).then((r) => r.data.game),
  submitTurn: (id: string, body: { expectedVersion: number; expectedTurn: number; eventId: string; idempotencyKey: string; optionId?: string }) =>
    call<{ game: GameView; turn?: TurnRecord; pending?: boolean }>("POST", `/api/games/${id}/turns`, body),
  retryTurn: (id: string, turn: number, body: { expectedVersion: number; idempotencyKey: string }) =>
    call<{ game: GameView; turn?: TurnRecord; pending?: boolean }>("POST", `/api/games/${id}/turns/${turn}/retry`, body),
  getTurn: (id: string, turn: number) => call<{ turn: TurnRecord; mode: string }>("GET", `/api/games/${id}/turns/${turn}`).then((r) => r.data.turn),
  replay: (id: string, withDeltas = true) => call<ReplayData>("GET", `/api/games/${id}/replay${withDeltas ? "" : "?deltas=0"}`).then((r) => r.data),
  abandon: (id: string, expectedVersion: number) => call<{ game: GameView }>("POST", `/api/games/${id}/abandon`, { expectedVersion }).then((r) => r.data.game),
};

/** Reuse one idempotency key per (game, turn) across double-clicks and reloads. */
export function idempotencyKeyFor(gameId: string, turn: number, optionId: string | undefined): string {
  const storageKey = `jc-intent:${gameId}:${turn}:${optionId ?? "nature"}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID().replace(/-/g, "");
    sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

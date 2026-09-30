import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { CONTENT_VERSION, contentHash } from "@/content/index";
import { DEFAULT_TOTAL_TURNS, MAX_TOTAL_TURNS, MIN_TOTAL_TURNS } from "@/lib/game/calendar";
import { deserializeState, hashState, serializeState, type SerializedGameState } from "@/lib/game/serialize";
import { isMatchOver, startGame } from "@/lib/game/turn";
import { TRIBE_IDS, type ChoiceMode, type ComputerStance, type DecisionMode, type GameState, type GameStatus, type TribeId } from "@/lib/game/types";
import { createInitialState } from "@/lib/game/world/generate";
import { getConfig } from "./config";
import { getDb, packJson, tx, unpackJson } from "./db";
import { ApiError } from "./http";
import { checkAndRecordGameCreation } from "./limits";
import { presentGame, tribePanels, type GameMeta, type PendingView } from "./present";
import { worldView } from "@/lib/game/serialize";

export interface GameRow {
  id: string;
  session_id: string;
  created_at: number;
  updated_at: number;
  status: GameStatus;
  mode: DecisionMode;
  supported_tribe: TribeId;
  seed: string;
  completed_turn: number;
  total_turns: number;
  version: number;
  schema_version: number;
  rules_version: string;
  content_version: string;
  content_hash: string;
  configured_model: string;
  state: Uint8Array;
  lease_token: number;
  lease_holder: string | null;
  lease_expires_at: number | null;
  attempts_used: number;
  usage_input_tokens: number;
  usage_output_tokens: number;
  usage_unknown_attempts: number;
  finished_at: number | null;
  abandoned_at: number | null;
}

export function statusForNextTurn(state: GameState): GameStatus {
  if (isMatchOver(state)) return "finished";
  return state.currentEvent?.source === "nature" ? "nature_pending" : "awaiting_player";
}

export function loadOwnedGame(sessionId: string | null, gameId: string): GameRow {
  if (!sessionId || !/^[0-9a-f-]{36}$/.test(gameId)) throw new ApiError(404, "game_not_found", "Game not found.");
  const row = getDb().prepare("SELECT * FROM games WHERE id = ?").get(gameId) as GameRow | undefined;
  // Game IDs alone never grant access: the session must own the game. Same 404 either way.
  if (!row || row.session_id !== sessionId) throw new ApiError(404, "game_not_found", "Game not found.");
  return row;
}

export function stateOf(row: Pick<GameRow, "state">): GameState {
  return deserializeState(unpackJson<SerializedGameState>(row.state));
}

export function metaOf(row: GameRow): GameMeta {
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    supportedTribeId: row.supported_tribe,
    version: row.version,
    configuredModel: row.configured_model,
    createdAt: row.created_at,
    attemptsUsed: row.attempts_used,
    maxAttempts: attemptBudget(row.total_turns),
    usage: { inputTokens: row.usage_input_tokens, outputTokens: row.usage_output_tokens, unknownAttempts: row.usage_unknown_attempts },
  };
}

export function newSeed(): string {
  return randomBytes(6).toString("hex");
}

/** Per-game Jev attempt budget: three attempts per turn, never above the configured cap. */
export function attemptBudget(totalTurns: number): number {
  return Math.min(getConfig().maxAttemptsPerGame, 3 * totalTurns);
}

export function createGame(
  sessionId: string,
  input: { tribeId: TribeId; seed?: string; mode: DecisionMode; totalTurns?: number; choiceMode?: ChoiceMode; stance?: ComputerStance },
) {
  const cfg = getConfig();
  if (!TRIBE_IDS.includes(input.tribeId)) throw new ApiError(422, "invalid_tribe", "Unknown tribe.");
  if (input.mode === "live" && !cfg.apiKey) {
    throw new ApiError(503, "live_unavailable", "Live mode needs TYPESAFE_API_KEY set on the server. Add it to .env.local and restart, or start a clearly labeled mock simulation if permitted.");
  }
  if (input.mode === "mock" && !cfg.allowMock) throw new ApiError(403, "mock_not_permitted", "Mock simulation is disabled on this server.");
  const seed = input.seed && input.seed.trim().length > 0 ? input.seed.trim().slice(0, 64) : newSeed();
  // The supported tribe is not an input to world generation: same seed → same world for every selection.
  const totalTurns = input.totalTurns ?? DEFAULT_TOTAL_TURNS;
  if (!Number.isInteger(totalTurns) || totalTurns < MIN_TOTAL_TURNS || totalTurns > MAX_TOTAL_TURNS) {
    throw new ApiError(422, "invalid_match_length", `Match length must be ${MIN_TOTAL_TURNS}–${MAX_TOTAL_TURNS} turns.`);
  }
  // The world never depends on the supported tribe; only the computer's environmental picks may be steered by it.
  const settings = { choiceMode: input.choiceMode ?? "alternate", stance: input.choiceMode === "player" ? "random" : (input.stance ?? "random"), supportedTribe: input.tribeId } as const;
  const state = startGame(createInitialState(seed, CONTENT_VERSION, contentHash(), totalTurns, settings));
  const id = randomUUID();
  const now = Date.now();
  const status = statusForNextTurn(state);
  const initial = { world: worldView(state.world), tribes: tribePanels(state), stateHash: hashState(state) };
  tx((db) => {
    checkAndRecordGameCreation(db, sessionId);
    db.prepare(
      `INSERT INTO games (id, session_id, created_at, updated_at, status, mode, supported_tribe, seed, completed_turn, total_turns, version,
        schema_version, rules_version, content_version, content_hash, configured_model, state, initial_view)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      sessionId,
      now,
      now,
      status,
      input.mode,
      input.tribeId,
      seed,
      totalTurns,
      state.schemaVersion,
      state.rulesVersion,
      state.contentVersion,
      state.contentHash,
      input.mode === "live" ? cfg.model : "mock-policy-1",
      packJson(serializeState(state)),
      packJson(initial),
    );
    db.prepare("INSERT INTO keyframes (game_id, turn, state) VALUES (?, 0, ?)").run(id, packJson(serializeState(state)));
  });
  return id;
}

export function listGames(sessionId: string) {
  const rows = getDb()
    .prepare("SELECT id, status, mode, supported_tribe, seed, completed_turn, total_turns, created_at, updated_at FROM games WHERE session_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(sessionId) as { id: string; status: string; mode: string; supported_tribe: string; seed: string; completed_turn: number; total_turns: number; created_at: number; updated_at: number }[];
  return rows.map((r) => ({ id: r.id, status: r.status, mode: r.mode, supportedTribeId: r.supported_tribe, seed: r.seed, completedTurn: r.completed_turn, totalTurns: r.total_turns, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export function pendingIntent(row: GameRow): PendingView | null {
  const intent = getDb()
    .prepare("SELECT id, turn, status, idempotency_key, option_id, error_code, error_message, attempts FROM turn_intents WHERE game_id = ? AND turn = ? AND status != 'completed'")
    .get(row.id, row.completed_turn + 1) as
    | { id: string; turn: number; status: string; idempotency_key: string; option_id: string; error_code: string | null; error_message: string | null; attempts: number }
    | undefined;
  if (!intent) return null;
  return {
    intentId: intent.id,
    turn: intent.turn,
    status: intent.status,
    idempotencyKey: intent.idempotency_key,
    optionId: intent.option_id,
    errorCode: intent.error_code,
    errorMessage: intent.error_message,
    attempts: intent.attempts,
    leaseActive: row.lease_holder !== null && (row.lease_expires_at ?? 0) > Date.now(),
  };
}

export function gameView(row: GameRow) {
  return presentGame(metaOf(row), stateOf(row), pendingIntent(row));
}

export function abandonGame(row: GameRow, expectedVersion: number) {
  if (row.status === "finished" || row.status === "abandoned") throw new ApiError(409, "not_abandonable", "This match is already over.");
  if (row.version !== expectedVersion) throw new ApiError(409, "stale_version", "The game changed; reload and try again.");
  if (row.lease_holder && (row.lease_expires_at ?? 0) > Date.now()) throw new ApiError(409, "turn_in_progress", "A turn is being decided; wait for it to finish.");
  tx((db) => {
    const r = db
      .prepare("UPDATE games SET status = 'abandoned', abandoned_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?")
      .run(Date.now(), Date.now(), row.id, expectedVersion);
    if (Number(r.changes) !== 1) throw new ApiError(409, "stale_version", "The game changed; reload and try again.");
  });
}

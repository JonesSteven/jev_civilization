import "server-only";
// Turn orchestration (PRD §18): a short transaction acquires a lease and freezes the intent; the Jev call
// happens with no transaction open; the response is persisted (lease-checked) before resolution; the commit
// is a compare-and-swap on version and lease token. Simulation advances exactly once per intent.

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { EVENT_BY_ID } from "@/content/events";
import { canonicalJson } from "@/lib/game/hash";
import { diffWorldView, hashState, serializeState } from "@/lib/game/serialize";
import { buildDecisionContext, effectiveOption, resolveTurn, type TurnResult } from "@/lib/game/turn";
import { TRIBE_IDS, type ActionCandidate, type GameOutcome, type TribeId } from "@/lib/game/types";
import { buildSnapshot } from "@/lib/game/candidates";
import { getConfig } from "./config";
import { getDb, packJson, tx, unpackJson } from "./db";
import { gameView, loadOwnedGame, stateOf, statusForNextTurn, type GameRow } from "./games";
import { ApiError } from "./http";
import { callJev, jevErrorMessage, type AttemptRecord } from "./jev/adapter";
import { MOCK_MODEL, mockRespond } from "./jev/mock";
import { buildJevRequest, type ExpectedQuestion, type JevRequest } from "./jev/request";
import type { ValidatedDecision } from "./jev/validate";
import { checkAndRecordTurnStart } from "./limits";

export const TurnBody = z
  .object({
    expectedVersion: z.number().int().min(1),
    expectedTurn: z.number().int().min(1).max(100),
    eventId: z.string().regex(/^E\d{2}$/),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    optionId: z.string().regex(/^E\d{2}_[a-z_]+$/).optional(),
  })
  .strict();
export type TurnBodyT = z.infer<typeof TurnBody>;

export const RetryBody = z
  .object({
    expectedVersion: z.number().int().min(1),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  })
  .strict();

interface IntentRow {
  id: string;
  game_id: string;
  turn: number;
  idempotency_key: string;
  body_hash: string;
  status: "pending" | "decided" | "completed" | "failed";
  source: string;
  event_id: string;
  option_id: string;
  pre_state_hash: string;
  pre_version: number;
  context: Uint8Array;
  response: Uint8Array | null;
  decisions: Uint8Array | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
}

interface FrozenContext {
  optionId: string;
  candidates: Partial<Record<TribeId, ActionCandidate[]>>;
  request: JevRequest | null;
  expected: ExpectedQuestion[];
  estimatedInputTokens: number;
  trimLevel: number;
}

interface SavedDecisions {
  decisions: ValidatedDecision[];
  model: string;
  responseId: string | null;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface TurnRecord {
  turn: number;
  intentId: string;
  mode: "live" | "mock";
  source: string;
  eventId: string;
  eventTitle: string;
  question: string;
  optionId: string;
  optionLabel: string;
  optionDescription: string;
  footprint: number[] | null;
  footprintLabel: string;
  configuredModel: string;
  model: string | null;
  responseId: string | null;
  latencyMs: number | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  estimatedInputTokens: number;
  trimLevel: number;
  request: JevRequest | null;
  attempts: AttemptRecord[];
  decisions: {
    tribeId: TribeId;
    selected: string;
    returnedChoice: string | null;
    forced: boolean;
    probabilities: Record<string, number>;
    rawProbabilities: Record<string, number>;
    confidence: number;
    offered: { id: string; kind: string; description: string; costs: ActionCandidate["costs"]; target: ActionCandidate["target"] }[];
  }[];
  outcomes: GameOutcome[];
  reports: TurnResult["reports"];
  scores: TurnResult["scores"];
  eliminated: TribeId[];
  tribes: { id: TribeId; alive: boolean; population: number; food: number; timber: number; stone: number; morale: number; militaryLevel: number; settlement: number }[];
  preStateHash: string;
  postStateHash: string;
  postStateVersion: number;
}

const LEASE_EXTRA_MS = 30_000;

function leaseMs(): number {
  const c = getConfig();
  return c.timeoutMs * c.maxAttemptsPerTurn + LEASE_EXTRA_MS;
}

function bodyHash(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function loadIntentByKey(key: string): IntentRow | undefined {
  return getDb().prepare("SELECT * FROM turn_intents WHERE idempotency_key = ?").get(key) as IntentRow | undefined;
}

function reloadGame(id: string): GameRow {
  return getDb().prepare("SELECT * FROM games WHERE id = ?").get(id) as unknown as GameRow;
}

export interface TurnResponse {
  status: number;
  body: Record<string, unknown>;
}

function turnView(record: TurnRecord) {
  return record;
}

export function loadTurnRecord(gameId: string, turn: number): TurnRecord | null {
  const row = getDb().prepare("SELECT record FROM turns WHERE game_id = ? AND turn = ?").get(gameId, turn) as { record: Uint8Array } | undefined;
  return row ? unpackJson<TurnRecord>(row.record) : null;
}

function completedResponse(gameId: string, turn: number): TurnResponse {
  const record = loadTurnRecord(gameId, turn);
  const row = reloadGame(gameId);
  return { status: 200, body: { game: gameView(row), turn: record ? turnView(record) : null } };
}

function pendingResponse(row: GameRow): TurnResponse {
  return { status: 202, body: { game: gameView(row), pending: true } };
}

/** Acquire the game lease for an intent. Returns the new monotonically increasing lease token. */
function acquireLease(gameId: string, intentId: string, expectVersion: number): number {
  const now = Date.now();
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE games SET lease_token = lease_token + 1, lease_holder = ?, lease_expires_at = ?, status = 'deciding', updated_at = ?
       WHERE id = ? AND version = ? AND (lease_holder IS NULL OR lease_expires_at < ? OR lease_holder = ?)`,
    )
    .run(intentId, now + leaseMs(), now, gameId, expectVersion, now, intentId);
  if (Number(r.changes) !== 1) throw new ApiError(409, "turn_in_progress", "Another request is already deciding this turn.");
  return (db.prepare("SELECT lease_token FROM games WHERE id = ?").get(gameId) as { lease_token: number }).lease_token;
}

function holdsLease(db: ReturnType<typeof getDb>, gameId: string, token: number): boolean {
  const row = db.prepare("SELECT lease_token FROM games WHERE id = ?").get(gameId) as { lease_token: number } | undefined;
  return row?.lease_token === token;
}

export async function submitTurn(sessionId: string, gameId: string, body: TurnBodyT): Promise<TurnResponse> {
  const row = loadOwnedGame(sessionId, gameId);
  const hash = bodyHash(body);
  const existing = loadIntentByKey(body.idempotencyKey);
  if (existing) {
    if (existing.game_id !== row.id || existing.body_hash !== hash) {
      throw new ApiError(409, "idempotency_conflict", "This idempotency key was already used with a different request.");
    }
    return continueIntent(existing, row);
  }
  const other = getDb().prepare("SELECT id, status FROM turn_intents WHERE game_id = ? AND turn = ?").get(row.id, body.expectedTurn) as { id: string; status: string } | undefined;
  if (other) {
    throw new ApiError(409, other.status === "completed" ? "turn_already_completed" : "turn_in_progress", "This turn was already started from another request. Reload to see its progress.");
  }
  if (row.status !== "awaiting_player" && row.status !== "nature_pending") {
    throw new ApiError(409, "not_accepting_turns", `The game is ${row.status.replace("_", " ")} and cannot start a turn.`);
  }
  if (row.version !== body.expectedVersion || row.completed_turn + 1 !== body.expectedTurn) {
    throw new ApiError(409, "stale_version", "The game has changed since this page loaded. Reload to continue.");
  }
  const state = stateOf(row);
  const prepared = state.currentEvent;
  if (!prepared || prepared.eventId !== body.eventId || prepared.turn !== body.expectedTurn) {
    throw new ApiError(409, "stale_event", "The prepared event does not match. Reload to continue.");
  }
  if (prepared.source === "player") {
    const ev = EVENT_BY_ID[prepared.eventId];
    if (!body.optionId || !ev?.options.some((o) => o.id === body.optionId)) {
      throw new ApiError(422, "invalid_option", "Choose one of the three options on this event card.");
    }
  } else if (body.optionId !== undefined) {
    throw new ApiError(422, "option_not_allowed", "Nature chooses on this turn; option IDs are not accepted.");
  }
  if (row.mode === "live" && row.attempts_used >= getConfig().maxAttemptsPerGame) {
    throw new ApiError(429, "jev_budget_exhausted", jevErrorMessage("jev_budget_exhausted"));
  }
  if (row.mode === "live" && !getConfig().apiKey) throw new ApiError(503, "jev_not_configured", jevErrorMessage("jev_not_configured"));

  const optionId = effectiveOption(prepared, body.optionId ?? null);
  const ctx = buildDecisionContext(state, optionId);
  const built = buildJevRequest(ctx, row.configured_model);
  const frozen: FrozenContext = {
    optionId,
    candidates: ctx.candidates,
    request: built.request,
    expected: built.expected,
    estimatedInputTokens: built.estimatedInputTokens,
    trimLevel: built.trimLevel,
  };
  const intentId = randomUUID();
  const leaseToken = tx((db) => {
    checkAndRecordTurnStart(db, sessionId);
    const now = Date.now();
    db.prepare(
      `INSERT INTO turn_intents (id, game_id, turn, idempotency_key, body_hash, status, source, event_id, option_id, pre_state_hash, pre_version, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(intentId, row.id, body.expectedTurn, body.idempotencyKey, hash, prepared.source, prepared.eventId, optionId, ctx.preStateHash, row.version, packJson(frozen), now, now);
    return acquireLease(row.id, intentId, row.version);
  });
  return runIntent(intentId, leaseToken);
}

async function continueIntent(intent: IntentRow, row: GameRow): Promise<TurnResponse> {
  if (intent.status === "completed") return completedResponse(row.id, intent.turn);
  const leaseActive = row.lease_holder !== null && (row.lease_expires_at ?? 0) > Date.now();
  if (leaseActive) return pendingResponse(row);
  if (intent.status === "failed") return failedResponse(row.id, intent.error_code ?? "jev_unavailable");
  // Pending or decided with an expired lease (e.g. after a restart): take over and finish.
  const token = tx(() => acquireLease(row.id, intent.id, intent.pre_version));
  return runIntent(intent.id, token);
}

/** Explicit Retry from a failed (or abandoned-by-restart) turn. Freezes the same intent and inputs. */
export async function retryTurn(sessionId: string, gameId: string, turn: number, body: z.infer<typeof RetryBody>): Promise<TurnResponse> {
  const row = loadOwnedGame(sessionId, gameId);
  const intent = loadIntentByKey(body.idempotencyKey);
  if (!intent || intent.game_id !== row.id || intent.turn !== turn) throw new ApiError(404, "intent_not_found", "No such pending turn.");
  if (intent.status === "completed") return completedResponse(row.id, turn);
  if (row.version !== body.expectedVersion || intent.pre_version !== row.version) {
    throw new ApiError(409, "stale_version", "The game has changed since this page loaded. Reload to continue.");
  }
  const leaseActive = row.lease_holder !== null && (row.lease_expires_at ?? 0) > Date.now();
  if (leaseActive) return pendingResponse(row);
  if (row.mode === "live" && !intent.decisions && row.attempts_used >= getConfig().maxAttemptsPerGame) {
    throw new ApiError(429, "jev_budget_exhausted", jevErrorMessage("jev_budget_exhausted"));
  }
  const token = tx((db) => {
    db.prepare("UPDATE turn_intents SET status = CASE WHEN decisions IS NULL THEN 'pending' ELSE 'decided' END, error_code = NULL, error_message = NULL, updated_at = ? WHERE id = ?").run(Date.now(), intent.id);
    return acquireLease(row.id, intent.id, row.version);
  });
  return runIntent(intent.id, token);
}

function failedResponse(gameId: string, code: string): TurnResponse {
  const row = reloadGame(gameId);
  const status = code === "jev_budget_exhausted" ? 429 : code === "jev_auth_failed" || code === "jev_not_configured" ? 503 : 503;
  return { status, body: { game: gameView(row), error: { code, message: jevErrorMessage(code) } } };
}

function recordFailure(gameId: string, intentId: string, token: number, code: string) {
  tx((db) => {
    if (!holdsLease(db, gameId, token)) return;
    db.prepare("UPDATE turn_intents SET status = 'failed', error_code = ?, error_message = ?, updated_at = ? WHERE id = ?").run(code, jevErrorMessage(code), Date.now(), intentId);
    db.prepare("UPDATE games SET status = 'turn_failed', lease_holder = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND lease_token = ?").run(Date.now(), gameId, token);
  });
}

async function decide(intent: IntentRow, row: GameRow, frozen: FrozenContext, token: number): Promise<SavedDecisions | { error: string }> {
  if (!frozen.request) return { decisions: [], model: row.mode === "live" ? row.configured_model : MOCK_MODEL, responseId: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } };
  if (row.mode === "mock") {
    const t0 = Date.now();
    const state = stateOf(row);
    const snapshot = buildSnapshot(state, frozen.optionId);
    const out = mockRespond({ turn: intent.turn, optionId: frozen.optionId, snapshot, candidates: frozen.candidates, preStateHash: intent.pre_state_hash }, frozen.expected);
    const latencyMs = Date.now() - t0;
    tx((db) =>
      db
        .prepare("INSERT INTO model_attempts (intent_id, game_id, attempt_no, started_at, latency_ms, http_status, outcome, model) VALUES (?, ?, ?, ?, ?, NULL, 'success', ?)")
        .run(intent.id, row.id, intent.attempts + 1, t0, latencyMs, MOCK_MODEL),
    );
    return { decisions: out.decisions, model: MOCK_MODEL, responseId: null, latencyMs, usage: { inputTokens: null, outputTokens: null } };
  }
  const attemptRows = new Map<number, number | bigint>();
  const result = await callJev(frozen.request, frozen.expected, {
    beforeAttempt: (n) =>
      tx((db) => {
        if (!holdsLease(db, row.id, token)) return false;
        const g = db.prepare("SELECT attempts_used FROM games WHERE id = ?").get(row.id) as { attempts_used: number };
        if (g.attempts_used >= getConfig().maxAttemptsPerGame) return false;
        db.prepare("UPDATE games SET attempts_used = attempts_used + 1 WHERE id = ?").run(row.id);
        db.prepare("UPDATE turn_intents SET attempts = attempts + 1, updated_at = ? WHERE id = ?").run(Date.now(), intent.id);
        const r = db
          .prepare("INSERT INTO model_attempts (intent_id, game_id, attempt_no, started_at, outcome) VALUES (?, ?, ?, ?, 'started')")
          .run(intent.id, row.id, intent.attempts + n, Date.now());
        attemptRows.set(n, r.lastInsertRowid);
        return true;
      }),
    afterAttempt: (rec) =>
      tx((db) => {
        const id = attemptRows.get(rec.attemptNo);
        if (id !== undefined) {
          db.prepare(
            "UPDATE model_attempts SET latency_ms = ?, http_status = ?, outcome = ?, error_code = ?, input_tokens = ?, output_tokens = ?, response_id = ?, model = ? WHERE id = ?",
          ).run(rec.latencyMs, rec.httpStatus, rec.outcome, rec.errorCode, rec.inputTokens, rec.outputTokens, rec.responseId, rec.model, id);
        }
        if (rec.inputTokens !== null) {
          db.prepare("UPDATE games SET usage_input_tokens = usage_input_tokens + ?, usage_output_tokens = usage_output_tokens + ? WHERE id = ?").run(rec.inputTokens, rec.outputTokens ?? 0, row.id);
        } else if (rec.outcome !== "budget_exhausted") {
          // Usage unknown for this attempt: counted separately, never claimed as zero-cost.
          db.prepare("UPDATE games SET usage_unknown_attempts = usage_unknown_attempts + 1 WHERE id = ?").run(row.id);
        }
      }),
  });
  if (!result.ok) return { error: result.errorCode };
  const last = result.attempts[result.attempts.length - 1];
  return {
    decisions: result.decisions,
    model: result.model ?? row.configured_model,
    responseId: result.responseId,
    latencyMs: result.latencyMs,
    usage: { inputTokens: last?.inputTokens ?? null, outputTokens: last?.outputTokens ?? null },
  };
}

async function runIntent(intentId: string, token: number): Promise<TurnResponse> {
  const db = getDb();
  const intent = db.prepare("SELECT * FROM turn_intents WHERE id = ?").get(intentId) as unknown as IntentRow;
  let row = reloadGame(intent.game_id);
  const frozen = unpackJson<FrozenContext>(intent.context);
  const state = stateOf(row);
  if (hashState(state) !== intent.pre_state_hash) {
    recordFailure(row.id, intent.id, token, "state_mismatch");
    throw new ApiError(500, "state_mismatch", "The saved pre-turn state does not match this turn's frozen intent.");
  }

  // 5. Decisions: reuse a persisted valid response (no second provider call), or ask Jev / the mock.
  let saved: SavedDecisions;
  if (intent.decisions) {
    saved = unpackJson<SavedDecisions>(intent.decisions);
  } else {
    const out = await decide(intent, row, frozen, token);
    if ("error" in out) {
      recordFailure(row.id, intent.id, token, out.error);
      return failedResponse(row.id, out.error);
    }
    saved = out;
    const persisted = tx((d) => {
      if (!holdsLease(d, row.id, token)) return false;
      d.prepare("UPDATE turn_intents SET decisions = ?, response = ?, status = 'decided', updated_at = ? WHERE id = ?").run(packJson(saved), packJson({ decisions: saved.decisions }), Date.now(), intent.id);
      d.prepare("UPDATE games SET status = 'resolving', updated_at = ? WHERE id = ? AND lease_token = ?").run(Date.now(), row.id, token);
      return true;
    });
    if (!persisted) return pendingResponse(reloadGame(row.id));
  }

  // 6–9. Resolve with the ordinary engine using the frozen candidates.
  const choices: Partial<Record<TribeId, string>> = {};
  for (const d of saved.decisions) choices[d.tribeId] = d.selected;
  const result = resolveTurn(state, frozen.optionId, choices, frozen.candidates);
  const postHash = hashState(result.state);
  const ev = EVENT_BY_ID[intent.event_id];
  const option = ev?.options.find((o) => o.id === frozen.optionId);
  const attempts = (
    db.prepare("SELECT attempt_no, started_at, latency_ms, http_status, outcome, error_code, input_tokens, output_tokens, response_id, model FROM model_attempts WHERE intent_id = ? ORDER BY id").all(intent.id) as {
      attempt_no: number;
      started_at: number;
      latency_ms: number | null;
      http_status: number | null;
      outcome: string;
      error_code: string | null;
      input_tokens: number | null;
      output_tokens: number | null;
      response_id: string | null;
      model: string | null;
    }[]
  ).map(
    (a): AttemptRecord => ({
      attemptNo: a.attempt_no,
      startedAt: a.started_at,
      latencyMs: a.latency_ms,
      httpStatus: a.http_status,
      outcome: a.outcome as AttemptRecord["outcome"],
      errorCode: a.error_code,
      inputTokens: a.input_tokens,
      outputTokens: a.output_tokens,
      responseId: a.response_id,
      model: a.model,
    }),
  );
  const record: TurnRecord = {
    turn: intent.turn,
    intentId: intent.id,
    mode: row.mode,
    source: intent.source,
    eventId: intent.event_id,
    eventTitle: ev?.title ?? intent.event_id,
    question: ev?.question ?? "",
    optionId: frozen.optionId,
    optionLabel: option?.label ?? frozen.optionId,
    optionDescription: option?.description ?? "",
    footprint: state.currentEvent?.footprint ?? null,
    footprintLabel: state.currentEvent?.footprintLabel ?? "",
    configuredModel: row.configured_model,
    model: saved.model,
    responseId: saved.responseId,
    latencyMs: saved.latencyMs,
    usage: saved.usage,
    estimatedInputTokens: frozen.estimatedInputTokens,
    trimLevel: frozen.trimLevel,
    request: frozen.request,
    attempts,
    decisions: saved.decisions.map((d) => ({
      tribeId: d.tribeId,
      selected: d.selected,
      returnedChoice: d.returnedChoice,
      forced: false,
      probabilities: d.probabilities,
      rawProbabilities: d.rawProbabilities,
      confidence: d.confidence,
      offered: (frozen.candidates[d.tribeId] ?? []).map((c) => ({ id: c.id, kind: c.kind, description: c.description, costs: c.costs, target: c.target })),
    })),
    outcomes: result.outcomes,
    reports: result.reports,
    scores: result.scores,
    eliminated: result.eliminated,
    tribes: TRIBE_IDS.map((id) => {
      const t = result.state.tribes[id];
      return { id, alive: t.alive, population: t.population, food: t.food, timber: t.timber, stone: t.stone, morale: t.morale, militaryLevel: t.militaryLevel, settlement: t.settlement };
    }),
    preStateHash: intent.pre_state_hash,
    postStateHash: postHash,
    postStateVersion: row.version + 1,
  };
  const delta = diffWorldView(state.world, result.state.world);
  const nextStatus = statusForNextTurn(result.state);

  const committed = tx((d) => {
    const now = Date.now();
    const r = d
      .prepare(
        `UPDATE games SET state = ?, completed_turn = ?, version = version + 1, status = ?, lease_holder = NULL, lease_expires_at = NULL,
           updated_at = ?, finished_at = CASE WHEN ? = 'finished' THEN ? ELSE finished_at END
         WHERE id = ? AND version = ? AND lease_token = ?`,
      )
      .run(packJson(serializeState(result.state)), result.state.completedTurn, nextStatus, now, nextStatus, now, row.id, row.version, token);
    if (Number(r.changes) !== 1) return false;
    d.prepare("INSERT INTO turns (game_id, turn, intent_id, record, delta, post_state_hash, post_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      row.id,
      intent.turn,
      intent.id,
      packJson(record),
      packJson(delta),
      postHash,
      row.version + 1,
      now,
    );
    if (intent.turn % 10 === 0) d.prepare("INSERT OR REPLACE INTO keyframes (game_id, turn, state) VALUES (?, ?, ?)").run(row.id, intent.turn, packJson(serializeState(result.state)));
    d.prepare("UPDATE turn_intents SET status = 'completed', updated_at = ? WHERE id = ?").run(now, intent.id);
    return true;
  });
  row = reloadGame(row.id);
  if (!committed) {
    // A replacement worker holds the lease or already committed; report whatever is current.
    const done = getDb().prepare("SELECT status FROM turn_intents WHERE id = ?").get(intent.id) as { status: string };
    return done.status === "completed" ? completedResponse(row.id, intent.turn) : pendingResponse(row);
  }
  return { status: 200, body: { game: gameView(row), turn: turnView(record) } };
}

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resetConfigForTests } from "@/lib/server/config";
import { getDb, openDatabase, setDbForTests } from "@/lib/server/db";
import { createGame, gameView, loadOwnedGame } from "@/lib/server/games";
import { exportGame, verifyReplay } from "@/lib/server/replay";
import { retryTurn, submitTurn } from "@/lib/server/turns";
import { startJevStub } from "../support/jevStub";

let stub: Awaited<ReturnType<typeof startJevStub>>;
let session: string;

function newSession(): string {
  const id = randomUUID();
  getDb().prepare("INSERT INTO sessions (id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)").run(id, `hash-${id}`, Date.now(), Date.now());
  return id;
}

let keyN = 0;
function body(gameId: string, sessionId = session, optionIndex = 0) {
  const g = gameView(loadOwnedGame(sessionId, gameId));
  return {
    expectedVersion: g.version,
    expectedTurn: g.completedTurn + 1,
    eventId: g.event!.eventId,
    idempotencyKey: `test-key-${++keyN}-${gameId.slice(0, 8)}`,
    ...(g.event!.source === "player" ? { optionId: g.event!.options[optionIndex % 3]!.id } : {}),
  };
}

beforeAll(async () => {
  stub = await startJevStub();
});
afterAll(async () => stub.close());
beforeEach(() => {
  resetConfigForTests();
  setDbForTests(openDatabase(":memory:"));
  session = newSession();
  stub.queue.length = 0;
  stub.captured.length = 0;
});

describe("turn orchestration", () => {
  it("commits a live turn with one batched Jev request and executes the top candidates (AC12)", async () => {
    const id = createGame(session, { tribeId: "windstep", mode: "live", seed: "orch" });
    const out = await submitTurn(session, id, body(id));
    expect(out.status).toBe(200);
    expect(stub.captured.length).toBe(1);
    const turn = out.body.turn as { decisions: { selected: string }[]; model: string; usage: { inputTokens: number } };
    expect(turn.decisions.length).toBe(4);
    for (const d of turn.decisions) expect(d.selected).toBe("rest");
    expect(turn.usage.inputTokens).toBe(1234);
    const g = gameView(loadOwnedGame(session, id));
    expect(g.completedTurn).toBe(1);
    expect(g.version).toBe(2);
    expect(g.status).toBe("nature_pending");
  });

  it("returns the existing result for a repeated intent and rejects conflicts (AC20)", async () => {
    const id = createGame(session, { tribeId: "hearthwood", mode: "live", seed: "idem" });
    const b = body(id);
    const [first, second] = await Promise.all([submitTurn(session, id, b), submitTurn(session, id, b).catch((e) => e)]);
    expect(first.status).toBe(200);
    const again = await submitTurn(session, id, b);
    expect(again.status).toBe(200);
    expect(stub.captured.length).toBe(1);
    expect(loadOwnedGame(session, id).completed_turn).toBe(1);
    void second;
    await expect(submitTurn(session, id, { ...b, optionId: b.optionId === "x" ? "y" : `${b.eventId}_zzz` })).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(submitTurn(session, id, { ...b, idempotencyKey: "another-tab-key-1" })).rejects.toMatchObject({ code: "turn_already_completed" });
    await expect(submitTurn(session, id, { ...body(id), expectedVersion: 1 })).rejects.toMatchObject({ code: "stale_version" });
  });

  it("validates option IDs on player turns and rejects them on Nature turns", async () => {
    const id = createGame(session, { tribeId: "stonehaven", mode: "mock", seed: "opts" });
    const b = body(id);
    await expect(submitTurn(session, id, { ...b, optionId: "E99_fake" })).rejects.toMatchObject({ code: "invalid_option" });
    await submitTurn(session, id, b);
    const n = body(id);
    await expect(submitTurn(session, id, { ...n, optionId: "E01_light" })).rejects.toMatchObject({ code: "option_not_allowed" });
  });

  it("denies another anonymous session (AC23)", async () => {
    const id = createGame(session, { tribeId: "ironfang", mode: "mock" });
    const other = newSession();
    expect(() => loadOwnedGame(other, id)).toThrow();
    await expect(submitTurn(other, id, body(id))).rejects.toMatchObject({ code: "game_not_found" });
  });

  it("pauses on provider failure with no partial advance, and retries the frozen intent (AC15, AC21)", async () => {
    const id = createGame(session, { tribeId: "windstep", mode: "live", seed: "fail" });
    const b = body(id);
    stub.queue.push({ kind: "status", status: 503 }, { kind: "status", status: 503 }, { kind: "status", status: 503 });
    const failed = await submitTurn(session, id, b);
    expect(failed.status).toBe(503);
    const row = loadOwnedGame(session, id);
    expect(row.status).toBe("turn_failed");
    expect(row.completed_turn).toBe(0);
    expect(row.version).toBe(1);
    const firstRequest = JSON.stringify(stub.captured[0]!.body);
    const ok = await retryTurn(session, id, 1, { expectedVersion: 1, idempotencyKey: b.idempotencyKey });
    expect(ok.status).toBe(200);
    // Retry sends the identical frozen request (same event option, footprint, candidates, state).
    expect(JSON.stringify(stub.captured[3]!.body)).toBe(firstRequest);
    expect(loadOwnedGame(session, id).completed_turn).toBe(1);
  });

  it("does not retry authentication errors and reports them explicitly", async () => {
    const id = createGame(session, { tribeId: "windstep", mode: "live" });
    stub.queue.push({ kind: "status", status: 401 });
    const out = await submitTurn(session, id, body(id));
    expect(out.status).toBe(503);
    expect((out.body.error as { code: string }).code).toBe("jev_auth_failed");
    expect(stub.captured.length).toBe(1);
  });

  it("resumes from a persisted response after a restart without another provider call (AC22)", async () => {
    const id = createGame(session, { tribeId: "hearthwood", mode: "live", seed: "restart" });
    const b = body(id);
    await submitTurn(session, id, b);
    const db = getDb();
    // Simulate a crash after the decision was saved but before commit: roll the game back to the pre-turn state.
    const intent = db.prepare("SELECT * FROM turn_intents WHERE game_id = ?").get(id) as { id: string };
    const k0 = db.prepare("SELECT state FROM keyframes WHERE game_id = ? AND turn = 0").get(id) as { state: Uint8Array };
    db.prepare("DELETE FROM turns WHERE game_id = ?").run(id);
    db.prepare("UPDATE games SET state = ?, completed_turn = 0, version = 1, status = 'resolving', lease_holder = ?, lease_expires_at = ? WHERE id = ?").run(k0.state, intent.id, Date.now() - 1000, id);
    db.prepare("UPDATE turn_intents SET status = 'decided' WHERE id = ?").run(intent.id);
    const calls = stub.captured.length;
    const resumed = await submitTurn(session, id, b);
    expect(resumed.status).toBe(200);
    expect(stub.captured.length).toBe(calls);
    expect(loadOwnedGame(session, id).completed_turn).toBe(1);
  });

  it("surfaces an explicit budget-exhausted state", async () => {
    const id = createGame(session, { tribeId: "windstep", mode: "live" });
    getDb().prepare("UPDATE games SET attempts_used = 300 WHERE id = ?").run(id);
    await expect(submitTurn(session, id, body(id))).rejects.toMatchObject({ code: "jev_budget_exhausted" });
  });

  it("refuses live games without a key and never falls back to mock", async () => {
    const saved = process.env.TYPESAFE_API_KEY;
    process.env.TYPESAFE_API_KEY = "";
    resetConfigForTests();
    expect(() => createGame(session, { tribeId: "windstep", mode: "live" })).toThrow(/TYPESAFE_API_KEY/);
    process.env.TYPESAFE_API_KEY = saved;
    resetConfigForTests();
  });

  it("records a replay that re-simulates to identical hashes and exports without secrets (AC16, AC19, AC24)", async () => {
    const id = createGame(session, { tribeId: "stonehaven", mode: "mock", seed: "replay" });
    for (let i = 0; i < 12; i++) {
      const out = await submitTurn(session, id, body(id, session, i));
      expect(out.status).toBe(200);
    }
    expect(stub.captured.length).toBe(0); // mock mode makes no provider calls
    const v = verifyReplay(id);
    expect(v).toEqual({ ok: true, turnsChecked: 12, mismatches: [] });
    const exported = JSON.stringify(exportGame(loadOwnedGame(session, id)));
    expect(exported).toContain("Mock simulation");
    expect(exported).not.toContain("test-key-not-real");
    expect(exported).not.toContain(session);
    expect(exported).not.toContain("Bearer");
  });
});

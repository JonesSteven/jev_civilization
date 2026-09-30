import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getConfig } from "@/app/api/config/route";
import { POST as createGame } from "@/app/api/games/route";
import { GET as getGame } from "@/app/api/games/[id]/route";
import { POST as postTurn } from "@/app/api/games/[id]/turns/route";
import { GET as getExport } from "@/app/api/games/[id]/export/route";
import { resetConfigForTests } from "@/lib/server/config";
import { openDatabase, setDbForTests } from "@/lib/server/db";

const ORIGIN = "http://localhost:3000";
function req(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  resetConfigForTests();
  setDbForTests(openDatabase(":memory:"));
});

describe("route handlers", () => {
  it("exposes only safe capabilities", async () => {
    const res = await getConfig(req("GET", "/api/config"));
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ liveAvailable: true, mockPermitted: true, model: "jev-1.13.0" });
    expect(text).not.toContain("test-key");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects cross-site mutations and unknown body fields", async () => {
    expect((await createGame(req("POST", "/api/games", { body: { tribeId: "windstep", mode: "mock" }, origin: "https://evil.example" }))).status).toBe(403);
    expect((await createGame(req("POST", "/api/games", { body: { tribeId: "windstep", mode: "mock" }, origin: null }))).status).toBe(403);
    const bad = await createGame(req("POST", "/api/games", { body: { tribeId: "windstep", mode: "mock", supportedBonus: 5 } }));
    expect(bad.status).toBe(422);
    for (const totalTurns of [5, 205, 33]) {
      const res = await createGame(req("POST", "/api/games", { body: { tribeId: "windstep", mode: "mock", totalTurns } }));
      expect(res.status).toBe(422);
    }
    const ok = await createGame(req("POST", "/api/games", { body: { tribeId: "windstep", mode: "mock", totalTurns: 150 } }));
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { game: { totalTurns: number } }).game.totalTurns).toBe(150);
  });

  it("creates games in each choice mode and rejects unknown modes", async () => {
    type Created = { game: { status: string; settings: { choiceMode: string; stance: string }; event: { source: string; natureOptionId: string | null } } };
    const make = (body: Record<string, unknown>) => createGame(req("POST", "/api/games", { body: { tribeId: "stonehaven", mode: "mock", ...body } }));
    const player = (await (await make({ choiceMode: "player", stance: "hurt" })).json()) as Created;
    expect(player.game.settings).toEqual({ choiceMode: "player", stance: "random" });
    expect(player.game.status).toBe("awaiting_player");
    const computer = (await (await make({ choiceMode: "computer", stance: "help" })).json()) as Created;
    expect(computer.game.settings).toEqual({ choiceMode: "computer", stance: "help" });
    expect(computer.game.status).toBe("nature_pending");
    expect(computer.game.event.natureOptionId).toBeTruthy();
    const fallback = (await (await make({})).json()) as Created;
    expect(fallback.game.settings).toEqual({ choiceMode: "alternate", stance: "random" });
    expect((await make({ choiceMode: "robot" })).status).toBe(422);
  });

  it("issues an HttpOnly SameSite=Lax session cookie and enforces ownership (AC23)", async () => {
    const res = await createGame(req("POST", "/api/games", { body: { tribeId: "hearthwood", mode: "mock", seed: "routes" } }));
    expect(res.status).toBe(201);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = setCookie.split(";")[0] as string;
    const { game } = (await res.json()) as { game: { id: string; version: number; event: { eventId: string; options: { id: string }[] } } };
    const mine = await getGame(req("GET", `/api/games/${game.id}`, { cookie }), params({ id: game.id }));
    expect(mine.status).toBe(200);
    const theirs = await getGame(req("GET", `/api/games/${game.id}`), params({ id: game.id }));
    expect(theirs.status).toBe(404);
    const turn = await postTurn(
      req("POST", `/api/games/${game.id}/turns`, { cookie, body: { expectedVersion: 1, expectedTurn: 1, eventId: game.event.eventId, idempotencyKey: "route-test-key-1", optionId: game.event.options[0]!.id } }),
      params({ id: game.id }),
    );
    expect(turn.status).toBe(200);
    const exp = await getExport(req("GET", `/api/games/${game.id}/export`, { cookie }), params({ id: game.id }));
    expect(exp.headers.get("content-disposition")).toContain("mock");
    const text = await exp.text();
    expect(text).not.toContain(cookie.split("=")[1] as string);
    expect(text).not.toContain("test-key-not-real");
  });
});

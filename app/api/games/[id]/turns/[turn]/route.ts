import type { NextRequest } from "next/server";
import { loadOwnedGame } from "@/lib/server/games";
import { ApiError, json } from "@/lib/server/http";
import { handle } from "@/lib/server/route";
import { loadTurnRecord } from "@/lib/server/turns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; turn: string }> }) {
  const { id, turn } = await ctx.params;
  return handle(req, {}, async (session) => {
    const row = loadOwnedGame(session?.id ?? null, id);
    const n = Number(turn);
    if (!Number.isInteger(n) || n < 1 || n > 200) throw new ApiError(400, "invalid_turn", "Turn must be 1–200.");
    const record = loadTurnRecord(row.id, n);
    if (!record) throw new ApiError(404, "turn_not_found", "That turn has not been completed.");
    return json({ turn: record, mode: row.mode });
  });
}

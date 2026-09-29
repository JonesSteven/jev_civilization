import type { NextRequest } from "next/server";
import { ApiError, json, parseBody } from "@/lib/server/http";
import { handle } from "@/lib/server/route";
import { RetryBody, retryTurn } from "@/lib/server/turns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; turn: string }> }) {
  const { id, turn } = await ctx.params;
  return handle(req, { mutation: true }, async (session) => {
    if (!session) throw new ApiError(404, "game_not_found", "Game not found.");
    const n = Number(turn);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new ApiError(400, "invalid_turn", "Turn must be 1–100.");
    const body = await parseBody(req, RetryBody);
    const out = await retryTurn(session.id, id, n, body);
    return json(out.body, { status: out.status });
  });
}

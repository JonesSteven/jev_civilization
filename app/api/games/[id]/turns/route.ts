import type { NextRequest } from "next/server";
import { ApiError, json, parseBody } from "@/lib/server/http";
import { handle } from "@/lib/server/route";
import { submitTurn, TurnBody } from "@/lib/server/turns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(req, { mutation: true }, async (session) => {
    if (!session) throw new ApiError(404, "game_not_found", "Game not found.");
    const body = await parseBody(req, TurnBody);
    const out = await submitTurn(session.id, id, body);
    return json(out.body, { status: out.status });
  });
}

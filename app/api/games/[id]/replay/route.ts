import type { NextRequest } from "next/server";
import { loadOwnedGame } from "@/lib/server/games";
import { json } from "@/lib/server/http";
import { replayData } from "@/lib/server/replay";
import { handle } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const withDeltas = req.nextUrl.searchParams.get("deltas") !== "0";
  return handle(req, {}, async (session) => {
    const data = replayData(loadOwnedGame(session?.id ?? null, id));
    if (withDeltas) return json(data);
    return json({ ...data, turns: data.turns.map((t) => ({ ...t, delta: null })) });
  });
}

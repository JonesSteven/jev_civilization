import type { NextRequest } from "next/server";
import { gameView, loadOwnedGame } from "@/lib/server/games";
import { json } from "@/lib/server/http";
import { handle } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(req, {}, async (session) => json({ game: gameView(loadOwnedGame(session?.id ?? null, id)) }));
}

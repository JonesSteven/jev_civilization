import type { NextRequest } from "next/server";
import { z } from "zod";
import { abandonGame, gameView, loadOwnedGame } from "@/lib/server/games";
import { ApiError, json, parseBody } from "@/lib/server/http";
import { handle } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ expectedVersion: z.number().int().min(1) }).strict();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(req, { mutation: true }, async (session) => {
    if (!session) throw new ApiError(404, "game_not_found", "Game not found.");
    const row = loadOwnedGame(session.id, id);
    const body = await parseBody(req, Body);
    abandonGame(row, body.expectedVersion);
    return json({ game: gameView(loadOwnedGame(session.id, id)) });
  });
}

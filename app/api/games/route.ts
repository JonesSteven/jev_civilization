import type { NextRequest } from "next/server";
import { z } from "zod";
import { TRIBE_IDS } from "@/lib/game/types";
import { createGame, gameView, listGames, loadOwnedGame } from "@/lib/server/games";
import { ApiError, json, parseBody } from "@/lib/server/http";
import { handle } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z
  .object({
    tribeId: z.enum(TRIBE_IDS),
    seed: z.string().max(64).regex(/^[A-Za-z0-9 _.-]*$/, "Seed may contain letters, numbers, spaces, dots, dashes, and underscores.").optional(),
    mode: z.enum(["live", "mock"]),
    totalTurns: z.number().int().min(10).max(200).multipleOf(5).optional(),
    choiceMode: z.enum(["player", "alternate", "computer"]).optional(),
    stance: z.enum(["help", "hurt", "random"]).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  return handle(req, { mutation: true, createSession: true }, async (session) => {
    if (!session) throw new ApiError(401, "no_session", "Session unavailable.");
    const body = await parseBody(req, CreateBody);
    const id = createGame(session.id, body);
    return json({ game: gameView(loadOwnedGame(session.id, id)) }, { status: 201 });
  });
}

export async function GET(req: NextRequest) {
  return handle(req, { createSession: true }, async (session) => json({ games: session ? listGames(session.id) : [] }));
}

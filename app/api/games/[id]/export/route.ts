import type { NextRequest } from "next/server";
import { loadOwnedGame } from "@/lib/server/games";
import { json } from "@/lib/server/http";
import { exportGame } from "@/lib/server/replay";
import { handle } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(req, {}, async (session) => {
    const row = loadOwnedGame(session?.id ?? null, id);
    const tag = row.mode === "mock" ? "mock" : "live";
    return json(exportGame(row), {
      headers: { "Content-Disposition": `attachment; filename="jev-civilizations-${tag}-${row.seed}-${row.id.slice(0, 8)}.json"` },
    });
  });
}

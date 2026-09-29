import type { NextRequest } from "next/server";
import { publicCapabilities } from "@/lib/server/config";
import { json } from "@/lib/server/http";
import { handle } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(req, {}, () => json(publicCapabilities()));
}

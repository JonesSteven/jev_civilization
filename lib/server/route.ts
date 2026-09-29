import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, correlationId, errorResponse } from "./http";
import { applySessionCookie, resolveSession, type Session } from "./session";

interface Options {
  mutation?: boolean;
  createSession?: boolean;
}

/** Shared wrapper: correlation ID, same-origin checks for mutations, session resolution, safe errors. */
export async function handle(req: NextRequest, opts: Options, fn: (session: Session | null) => Promise<NextResponse> | NextResponse): Promise<NextResponse> {
  const cid = correlationId();
  let session: Session | null = null;
  try {
    if (opts.mutation) assertSameOrigin(req);
    session = resolveSession(req, opts.createSession ?? false);
    const res = await fn(session);
    res.headers.set("X-Correlation-Id", cid);
    return applySessionCookie(res, session);
  } catch (err) {
    const res = errorResponse(err, cid);
    res.headers.set("X-Correlation-Id", cid);
    return applySessionCookie(res, session);
  }
}

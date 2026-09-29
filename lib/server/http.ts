import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { getConfig } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...(init.headers ?? {}) } });
}

/** Stable machine-readable error body with a correlation ID; never includes upstream secrets. */
export function errorResponse(err: unknown, correlationId: string) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, correlationId, ...(err.details ? { details: err.details } : {}) } }, { status: err.status });
  }
  console.error(`[${correlationId}] unhandled error:`, err instanceof Error ? err.message : "unknown");
  return json({ error: { code: "internal_error", message: "Something went wrong on the server.", correlationId } }, { status: 500 });
}

/** Same-origin check for mutations: Origin (or Referer) must match APP_ORIGIN, or the request host. */
export function assertSameOrigin(req: NextRequest) {
  const cfg = getConfig();
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer") as string).origin : null);
  if (!origin) throw new ApiError(403, "origin_required", "Cross-site request rejected.");
  const expected = cfg.appOrigin ?? `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  if (origin !== expected) throw new ApiError(403, "origin_mismatch", "Cross-site request rejected.");
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) throw new ApiError(415, "unsupported_media_type", "Requests must be JSON.");
}

export async function parseBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 16_384) throw new ApiError(413, "body_too_large", "Request body too large.");
    raw = text.length ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "invalid_json", "Request body is not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, "invalid_request", "Request body failed validation.", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  return parsed.data;
}

export function correlationId(): string {
  return randomUUID();
}

import "server-only";
// The only module that contacts Jev. It owns the complete retry/timeout policy (no SDK retries).
// The destination is fixed; the Authorization header is added here and never stored or returned.

import { getConfig, JEV_ENDPOINT } from "../config";
import { providerSemaphore } from "../limits";
import type { ExpectedQuestion, JevRequest } from "./request";
import { InvalidResponseError, validateJevResponse, type ValidatedDecision } from "./validate";

export type AttemptOutcome = "success" | "http_error" | "timeout" | "network_error" | "invalid_response" | "budget_exhausted";

export interface AttemptRecord {
  attemptNo: number;
  startedAt: number;
  latencyMs: number | null;
  httpStatus: number | null;
  outcome: AttemptOutcome;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  responseId: string | null;
  model: string | null;
}

export type JevCallResult =
  | { ok: true; body: unknown; decisions: ValidatedDecision[]; attempts: AttemptRecord[]; responseId: string | null; model: string | null; latencyMs: number }
  | { ok: false; errorCode: string; message: string; attempts: AttemptRecord[] };

export interface CallHooks {
  /** Called before each attempt; returning false stops with budget_exhausted. Must persist the attempt count. */
  beforeAttempt: (attemptNo: number) => boolean;
  afterAttempt: (record: AttemptRecord) => void;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
let fetchImpl: FetchLike = (url, init) => fetch(url, init);
let sleepImpl = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tests route the fixed endpoint to a local HTTP stub; production code never changes the destination. */
export function setFetchForTests(f: FetchLike | null, sleep?: (ms: number) => Promise<void>) {
  fetchImpl = f ?? ((url, init) => fetch(url, init));
  if (sleep) sleepImpl = sleep;
}

const RETRYABLE_STATUS = new Set([429, 529]);

function statusCode(status: number): string {
  if (status === 401 || status === 403) return "jev_auth_failed";
  if (status === 429) return "jev_rate_limited";
  if (status === 529) return "jev_overloaded";
  if (status >= 500) return "jev_server_error";
  return "jev_request_rejected";
}

function retryAfterMs(h: string | null): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(h);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

const MESSAGES: Record<string, string> = {
  jev_auth_failed: "Jev rejected the server's API key. Check TYPESAFE_API_KEY and retry.",
  jev_request_rejected: "Jev rejected the request format. This turn cannot be retried automatically.",
  jev_rate_limited: "Jev is rate limiting requests. Please retry shortly.",
  jev_overloaded: "Jev is temporarily overloaded. Please retry shortly.",
  jev_server_error: "Jev returned a server error. Please retry.",
  jev_timeout: "Jev did not answer in time. Please retry.",
  jev_network_error: "The server could not reach Jev. Please retry.",
  jev_invalid_response: "Jev returned a response that failed validation. Please retry.",
  jev_budget_exhausted: "This game has used its maximum number of Jev attempts.",
  jev_not_configured: "Live mode needs TYPESAFE_API_KEY configured on the server.",
};

export function jevErrorMessage(code: string): string {
  return MESSAGES[code] ?? "Jev is unavailable.";
}

export async function callJev(request: JevRequest, expected: ExpectedQuestion[], hooks: CallHooks): Promise<JevCallResult> {
  const cfg = getConfig();
  const attempts: AttemptRecord[] = [];
  if (!cfg.apiKey) return { ok: false, errorCode: "jev_not_configured", message: jevErrorMessage("jev_not_configured"), attempts };
  const deadline = Date.now() + cfg.timeoutMs * cfg.maxAttemptsPerTurn + 15_000;
  let malformedRetried = false;
  let lastError = "jev_network_error";

  for (let n = 1; n <= cfg.maxAttemptsPerTurn; n++) {
    if (!hooks.beforeAttempt(n)) {
      const rec: AttemptRecord = { attemptNo: n, startedAt: Date.now(), latencyMs: null, httpStatus: null, outcome: "budget_exhausted", errorCode: "jev_budget_exhausted", inputTokens: null, outputTokens: null, responseId: null, model: null };
      attempts.push(rec);
      return { ok: false, errorCode: "jev_budget_exhausted", message: jevErrorMessage("jev_budget_exhausted"), attempts };
    }
    const release = await providerSemaphore.acquire();
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    let rec: AttemptRecord = { attemptNo: n, startedAt: started, latencyMs: null, httpStatus: null, outcome: "network_error", errorCode: null, inputTokens: null, outputTokens: null, responseId: null, model: null };
    let retryDelay: number | null = null;
    let retryable = false;
    try {
      const res = await fetchImpl(JEV_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        cache: "no-store",
        signal: controller.signal,
      });
      const text = await res.text();
      rec = { ...rec, latencyMs: Date.now() - started, httpStatus: res.status, responseId: res.headers.get("x-typesafe-request-id") };
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      const usage = (body as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null)?.usage;
      if (usage && typeof usage.input_tokens === "number") rec.inputTokens = usage.input_tokens;
      if (usage && typeof usage.output_tokens === "number") rec.outputTokens = usage.output_tokens;
      rec.model = typeof (body as { model?: unknown } | null)?.model === "string" ? ((body as { model: string }).model) : null;

      if (!res.ok) {
        const code = statusCode(res.status);
        rec = { ...rec, outcome: "http_error", errorCode: code };
        lastError = code;
        retryable = RETRYABLE_STATUS.has(res.status) || res.status >= 500;
        retryDelay = retryAfterMs(res.headers.get("retry-after"));
      } else {
        try {
          const decisions = validateJevResponse(body, expected);
          rec = { ...rec, outcome: "success" };
          attempts.push(rec);
          hooks.afterAttempt(rec);
          return { ok: true, body, decisions, attempts, responseId: rec.responseId, model: rec.model, latencyMs: rec.latencyMs ?? 0 };
        } catch (e) {
          const msg = e instanceof InvalidResponseError ? e.message : "invalid response";
          rec = { ...rec, outcome: "invalid_response", errorCode: "jev_invalid_response" };
          lastError = "jev_invalid_response";
          // A malformed response may be retried once, within the total attempt cap, with no repair model.
          retryable = !malformedRetried;
          malformedRetried = true;
          console.warn(`[jev] invalid response on attempt ${n}: ${msg}`);
        }
      }
    } catch (e) {
      const aborted = controller.signal.aborted;
      rec = { ...rec, latencyMs: Date.now() - started, outcome: aborted ? "timeout" : "network_error", errorCode: aborted ? "jev_timeout" : "jev_network_error" };
      lastError = rec.errorCode as string;
      retryable = true;
      void e;
    } finally {
      clearTimeout(timer);
      release();
    }
    attempts.push(rec);
    hooks.afterAttempt(rec);
    if (!retryable || n >= cfg.maxAttemptsPerTurn) break;
    const backoff = retryDelay ?? Math.min(4000, 500 * 2 ** (n - 1));
    if (Date.now() + backoff + cfg.timeoutMs > deadline) break;
    await sleepImpl(backoff);
  }
  return { ok: false, errorCode: lastError, message: jevErrorMessage(lastError), attempts };
}

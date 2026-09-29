import http from "node:http";
import type { AddressInfo } from "node:net";
import { setFetchForTests } from "@/lib/server/jev/adapter";

export type StubReply =
  | { kind: "ok"; mutate?: (body: Record<string, unknown>) => void }
  | { kind: "status"; status: number; headers?: Record<string, string>; body?: unknown }
  | { kind: "hang" }
  | { kind: "raw"; text: string };

export interface Captured {
  body: Record<string, unknown>;
  authorization: string | undefined;
}

/** Local HTTP stand-in for the TypeSafe endpoint. Answers each choice question validly by default. */
export async function startJevStub() {
  const queue: StubReply[] = [];
  const captured: Captured[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const body = JSON.parse(data || "{}");
      captured.push({ body, authorization: req.headers.authorization });
      const reply = queue.shift() ?? { kind: "ok" };
      if (reply.kind === "hang") return; // never answers → client timeout
      if (reply.kind === "raw") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(reply.text);
        return;
      }
      if (reply.kind === "status") {
        res.writeHead(reply.status, { "content-type": "application/json", ...(reply.headers ?? {}) });
        res.end(JSON.stringify(reply.body ?? { detail: "stub error" }));
        return;
      }
      const answers: Record<string, unknown> = {};
      for (const [qid, q] of Object.entries(body.questions as Record<string, { criteria: Record<string, string> }>)) {
        const keys = Object.keys(q.criteria);
        // Prefer "rest" deterministically so tests are stable; spread the remainder.
        const top = keys.includes("rest") ? "rest" : (keys[0] as string);
        const probs: Record<string, number> = {};
        const rest = keys.length > 1 ? 0.4 / (keys.length - 1) : 0;
        for (const k of keys) probs[k] = k === top ? (keys.length > 1 ? 0.6 : 1) : rest;
        answers[qid] = { type: "choice", choice: top, probabilities: probs, confidence: 0.6 };
      }
      const out = { model: "jev-1.13.0", answers, usage: { input_tokens: 1234, output_tokens: 56 } };
      reply.mutate?.(out as unknown as Record<string, unknown>);
      res.writeHead(200, { "content-type": "application/json", "x-typesafe-request-id": `req_stub_${captured.length}` });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  setFetchForTests(
    (url, init) => {
      if (url !== "https://api.typesafe.ai/v1/systemone") throw new Error(`unexpected destination ${url}`);
      return fetch(`http://127.0.0.1:${port}/v1/systemone`, init);
    },
    async () => undefined,
  );
  return {
    queue,
    captured,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

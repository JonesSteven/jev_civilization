// E2E-only preload (NODE_OPTIONS=--import): routes the fixed TypeSafe endpoint to an in-process fake so
// browser tests never reach the real API. Production code and its fixed destination are unchanged.
// Behaviour: every request on calendar turn 3 fails with 503 until three such failures have occurred
// (one full failed turn); everything else gets a valid answer that prefers "rest".
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const realFetch = globalThis.fetch;
let turn3Failures = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== ENDPOINT) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (body?.state?.calendar?.turn === 3 && turn3Failures < 3) {
    turn3Failures++;
    return new Response(JSON.stringify({ detail: "stub overloaded" }), { status: 503, headers: { "content-type": "application/json" } });
  }
  const answers = {};
  for (const [qid, q] of Object.entries(body.questions ?? {})) {
    const keys = Object.keys(q.criteria);
    const top = keys.includes("rest") ? "rest" : keys[0];
    const probabilities = {};
    for (const k of keys) probabilities[k] = k === top ? (keys.length > 1 ? 0.6 : 1) : 0.4 / (keys.length - 1);
    answers[qid] = { type: "choice", choice: top, probabilities, confidence: 0.6 };
  }
  return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 999, output_tokens: 9 } }), {
    status: 200,
    headers: { "content-type": "application/json", "x-typesafe-request-id": "req_e2e_stub" },
  });
};

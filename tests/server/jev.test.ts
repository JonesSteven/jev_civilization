import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildDecisionContext } from "@/lib/game/turn";
import { callJev, type AttemptRecord } from "@/lib/server/jev/adapter";
import { buildJevRequest, instructionFor } from "@/lib/server/jev/request";
import { InvalidResponseError, validateJevResponse } from "@/lib/server/jev/validate";
import { newGame, optionFor } from "../support/fixtures";
import { startJevStub } from "../support/jevStub";

const expected = [{ questionId: "decision_hearthwood", tribeId: "hearthwood" as const, candidateIds: ["rest", "gather_food", "train"] }];
const answer = (a: Record<string, unknown>) => ({ answers: { decision_hearthwood: { type: "choice", choice: "gather_food", probabilities: { rest: 0.2, gather_food: 0.7, train: 0.1 }, confidence: 0.7, ...a } } });

describe("response validation (§11.3)", () => {
  it("selects the highest-probability offered candidate", () => {
    const [d] = validateJevResponse(answer({}), expected);
    expect(d!.selected).toBe("gather_food");
  });
  it("normalizes small rounding drift and keeps raw values", () => {
    const [d] = validateJevResponse(answer({ probabilities: { rest: 0.2, gather_food: 0.705, train: 0.1 } }), expected);
    expect(Object.values(d!.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(d!.rawProbabilities.gather_food).toBe(0.705);
  });
  it("breaks exact ties by the returned choice, then stable ID order", () => {
    const tie = { rest: 0.4, gather_food: 0.4, train: 0.2 };
    expect(validateJevResponse(answer({ probabilities: tie, choice: "rest" }), expected)[0]!.selected).toBe("rest");
    expect(validateJevResponse(answer({ probabilities: tie, choice: null }), expected)[0]!.selected).toBe("gather_food");
  });
  it.each([
    ["missing answer", { answers: {} }],
    ["unexpected question", { answers: { ...answer({}).answers, decision_windstep: {} } }],
    ["unoffered option", answer({ probabilities: { rest: 0.3, gather_food: 0.6, train: 0.05, raid_x: 0.05 } })],
    ["omitted option", answer({ probabilities: { rest: 0.3, gather_food: 0.7 } })],
    ["bad sum", answer({ probabilities: { rest: 0.5, gather_food: 0.7, train: 0.1 } })],
    ["non-finite probability", answer({ probabilities: { rest: Number.NaN, gather_food: 0.7, train: 0.1 } })],
    ["bad confidence", answer({ confidence: 1.5 })],
    ["wrong type", answer({ type: "score" })],
    ["inconsistent choice", answer({ choice: "train" })],
  ])("rejects %s", (_, body) => {
    expect(() => validateJevResponse(body, expected)).toThrow(InvalidResponseError);
  });
});

describe("request construction", () => {
  it("excludes the supported tribe, seed, and future Nature choices; identical across supported tribes (AC13)", () => {
    const a = newGame("privacy-seed-xyz");
    const b = newGame("privacy-seed-xyz");
    const ra = buildJevRequest(buildDecisionContext(a, optionFor(a)), "jev-1.13.0").request!;
    const rb = buildJevRequest(buildDecisionContext(b, optionFor(b)), "jev-1.13.0").request!;
    const text = JSON.stringify(ra);
    expect(text).toBe(JSON.stringify(rb));
    expect(text).not.toContain("privacy-seed-xyz");
    expect(text.toLowerCase()).not.toContain("supported");
    expect(text).not.toContain("natureOptionId");
    expect(Object.keys(ra.questions).sort()).toEqual(["decision_hearthwood", "decision_ironfang", "decision_stonehaven", "decision_windstep"]);
    expect(ra.questions.decision_hearthwood!.instructions).toBe(instructionFor("hearthwood"));
    expect(ra.questions.decision_hearthwood!.instructions).toContain("views.hearthwood");
  });
});

describe("adapter against a local HTTP stub", () => {
  let stub: Awaited<ReturnType<typeof startJevStub>>;
  const s = newGame("adapter");
  const built = buildJevRequest(buildDecisionContext(s, optionFor(s)), "jev-1.13.0");
  const run = () => {
    const records: AttemptRecord[] = [];
    let n = 0;
    return callJev(built.request!, built.expected, { beforeAttempt: () => ++n <= 10, afterAttempt: (r) => records.push(r) }).then((res) => ({ res, records }));
  };
  beforeAll(async () => (stub = await startJevStub()));
  afterAll(async () => stub.close());
  beforeEach(() => {
    stub.queue.length = 0;
    stub.captured.length = 0;
  });

  it("sends one batched request with bearer auth to the fixed endpoint", async () => {
    const { res } = await run();
    expect(res.ok).toBe(true);
    expect(stub.captured.length).toBe(1);
    expect(stub.captured[0]!.authorization).toBe("Bearer test-key-not-real-0123456789");
    expect(stub.captured[0]!.body.model).toBe("jev-1.13.0");
    if (res.ok) expect(res.responseId).toBe("req_stub_1");
  });

  it("does not retry authentication failures", async () => {
    stub.queue.push({ kind: "status", status: 401 });
    const { res } = await run();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("jev_auth_failed");
    expect(stub.captured.length).toBe(1);
  });

  it("retries 429 (honoring Retry-After) and 529, then succeeds", async () => {
    stub.queue.push({ kind: "status", status: 429, headers: { "retry-after": "0" } }, { kind: "status", status: 529 });
    const { res, records } = await run();
    expect(res.ok).toBe(true);
    expect(stub.captured.length).toBe(3);
    expect(records.map((r) => r.outcome)).toEqual(["http_error", "http_error", "success"]);
  });

  it("stops after the per-turn attempt cap", async () => {
    stub.queue.push({ kind: "status", status: 503 }, { kind: "status", status: 503 }, { kind: "status", status: 503 }, { kind: "ok" });
    const { res } = await run();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("jev_server_error");
    expect(stub.captured.length).toBe(3);
  });

  it("times out a hung attempt and retries", async () => {
    stub.queue.push({ kind: "hang" });
    const { res, records } = await run();
    expect(records[0]!.outcome).toBe("timeout");
    expect(res.ok).toBe(true);
  });

  it("retries a malformed response only once", async () => {
    stub.queue.push({ kind: "raw", text: "{\"answers\":{}}" }, { kind: "raw", text: "not json" }, { kind: "ok" });
    const { res } = await run();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("jev_invalid_response");
    expect(stub.captured.length).toBe(2);
  });
});

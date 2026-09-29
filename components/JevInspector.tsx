"use client";

import { useState } from "react";
import { TRIBES } from "@/content/tribes";
import type { TurnRecord } from "@/lib/client/types";

type Tab = "decisions" | "context" | "advanced";

function Facts({ record, tribeId }: { record: TurnRecord; tribeId: string }) {
  const view = (record.request?.state.views as Record<string, { food: { status: string; coverageTurns: number; netPerTurn: number }; shelter: { coverage: number; winterExposureRisk: string }; morale: { level: string } }> | undefined)?.[tribeId];
  if (!view) return null;
  const cal = record.request?.state.calendar;
  return (
    <p className="small muted" style={{ margin: "4px 0" }}>
      Facts available (not a reasoning chain): food {view.food.status} ({view.food.coverageTurns} turns, net {view.food.netPerTurn}/turn), shelter coverage {Math.round(view.shelter.coverage * 100)}%, morale {view.morale.level}
      {cal ? `, ${cal.season} turn ${cal.turn}` : ""}; announced: {record.request?.state.announcedEvent.title} — {record.request?.state.announcedEvent.option}.
    </p>
  );
}

export default function JevInspector({ record, mode }: { record: TurnRecord | null; mode: "live" | "mock" }) {
  const [tab, setTab] = useState<Tab>("decisions");
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!record) return <p className="muted">After the first turn, this shows what the decision model received and returned for each tribe.</p>;
  const isMock = record.mode === "mock";
  return (
    <div className="inspector">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <strong>Turn {record.turn}</strong>
        <span className={`chip ${isMock ? "badge-mock" : "badge-live"}`}>{isMock ? "Mock simulation — not Jev" : "Live Jev output"}</span>
        <span className="chip">Model: {record.model ?? record.configuredModel}</span>
        {record.latencyMs !== null && <span className="chip">Latency {record.latencyMs} ms</span>}
        <span className="chip">{record.eventTitle}: {record.optionLabel}</span>
      </div>
      <div className="tabs" role="tablist">
        {(["decisions", "context", "advanced"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "decisions" ? "Decisions" : t === "context" ? "Context sent" : "Advanced"}
          </button>
        ))}
      </div>
      {tab === "decisions" && (
        <div>
          <p className="small muted">
            Probabilities are the model&apos;s preference among the listed legal actions — not chances of success. The game executes the highest-probability action; raid odds and all results are calculated by the game engine.
          </p>
          {record.decisions.length === 0 && <p>No living tribes: environment-only turn, no model request.</p>}
          {record.decisions.map((d) => {
            const ranked = Object.entries(d.probabilities).sort((a, b) => b[1] - a[1]);
            const top = ranked.slice(0, 4);
            const offeredById = new Map(d.offered.map((o) => [o.id, o]));
            const show = expanded === d.tribeId;
            return (
              <div key={d.tribeId} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="swatch" style={{ background: TRIBES[d.tribeId].color }} aria-hidden="true" />
                  <strong>{TRIBES[d.tribeId].name}</strong>
                  <span>→ <span className="mono">{d.selected}</span></span>
                  <span className="muted small">confidence {d.confidence.toFixed(2)}{d.returnedChoice && d.returnedChoice !== d.selected ? ` · returned choice ${d.returnedChoice}` : ""}</span>
                </div>
                <Facts record={record} tribeId={d.tribeId} />
                <table>
                  <tbody>
                    {top.map(([id, p]) => (
                      <tr key={id} className={id === d.selected ? "selected-row" : ""}>
                        <td style={{ width: "44%" }}>
                          <span className="mono">{id}</span>
                          <div className="small muted">{offeredById.get(id)?.description}</div>
                        </td>
                        <td style={{ width: "40%" }}>
                          <div className="prob-track"><div className="prob-bar" style={{ width: `${Math.max(0.5, p * 100)}%` }} /></div>
                        </td>
                        <td className="num" style={{ textAlign: "right" }}>{(p * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="btn btn-sm" onClick={() => setExpanded(show ? null : d.tribeId)} style={{ marginTop: 4 }}>
                  {show ? "Hide" : "Show"} all {d.offered.length} offered actions
                </button>
                {show && (
                  <table style={{ marginTop: 6 }}>
                    <thead><tr><th>Action ID</th><th>Exact text offered</th><th>Probability</th></tr></thead>
                    <tbody>
                      {ranked.map(([id, p]) => (
                        <tr key={id} className={id === d.selected ? "selected-row" : ""}>
                          <td className="mono">{id}</td>
                          <td>{record.request?.questions[`decision_${d.tribeId}`]?.criteria[id] ?? offeredById.get(id)?.description}</td>
                          <td className="num">{(p * 100).toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === "context" && (
        <div>
          <p className="small muted">
            {isMock
              ? "Mock simulation: this is the context that would be sent to Jev; decisions came from the local mock policy instead."
              : "The exact JSON body sent to Jev for this turn (the server adds the Authorization header, which is never stored or shown)."}
          </p>
          <pre className="context">{record.request ? JSON.stringify(record.request, null, 2) : "No request (no living tribes)."}</pre>
        </div>
      )}
      {tab === "advanced" && (
        <div>
          <table>
            <tbody>
              <tr><th>Configured model</th><td className="mono">{record.configuredModel}</td></tr>
              <tr><th>Resolved model</th><td className="mono">{record.model ?? "—"}</td></tr>
              <tr><th>Response ID</th><td className="mono">{record.responseId ?? "—"}</td></tr>
              <tr><th>Input / output tokens</th><td className="num">{record.usage.inputTokens ?? "unknown"} / {record.usage.outputTokens ?? "unknown"}</td></tr>
              <tr><th>Local token estimate</th><td className="num">~{record.estimatedInputTokens} (advisory; trim level {record.trimLevel})</td></tr>
              <tr><th>Pre / post state hash</th><td className="mono">{record.preStateHash} → {record.postStateHash}</td></tr>
            </tbody>
          </table>
          <h4 style={{ marginTop: 10 }}>Attempts</h4>
          <table>
            <thead><tr><th>#</th><th>Outcome</th><th>HTTP</th><th>Latency</th><th>Tokens in/out</th><th>Error</th></tr></thead>
            <tbody>
              {record.attempts.map((a) => (
                <tr key={`${a.attemptNo}-${a.startedAt}`}>
                  <td>{a.attemptNo}</td><td>{a.outcome}</td><td>{a.httpStatus ?? "—"}</td><td>{a.latencyMs ?? "—"} ms</td>
                  <td className="num">{a.inputTokens ?? "?"}/{a.outputTokens ?? "?"}</td><td>{a.errorCode ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mode === "live" && <p className="small muted">Usage is reported by the API per attempt; attempts without reported usage are counted as unknown, never as free.</p>}
        </div>
      )}
    </div>
  );
}

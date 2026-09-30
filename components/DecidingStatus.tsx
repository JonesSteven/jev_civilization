"use client";

import { useEffect, useState } from "react";

interface Props {
  /** When the request started (ms since epoch); null while waiting on another tab or a reload. */
  since: number | null;
  mode: "live" | "mock";
  model: string;
  tribeNames: string[];
  /** Short line naming the environmental choice being applied, e.g. "Nature chose Bitter winter". */
  choice: string;
  reducedMotion: boolean;
}

/** Stages of a turn, shown in order while the request is out. The server does not report its phases. */
const EXPECTED_MS = { live: 2500, mock: 400 };

export default function DecidingStatus({ since, mode, model, tribeNames, choice, reducedMotion }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [start] = useState(() => since ?? Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = Math.max(0, now - (since ?? start));
  const expected = EXPECTED_MS[mode];
  // Ease toward 90% over the expected time, then creep; the bar fills when the result arrives and this unmounts.
  const progress = Math.min(0.95, 0.9 * (1 - Math.exp((-2.3 * elapsed) / expected)) + Math.min(0.05, elapsed / 60_000));
  const decider = mode === "mock" ? "the mock policy (not Jev)" : `Jev (${model})`;
  const steps = [
    { at: 0, text: `${choice}. Sending the world and each tribe's options to ${decider}` },
    { at: expected * 0.2, text: `${mode === "mock" ? "The mock policy" : "Jev"} is choosing for ${tribeNames.join(", ")}` },
    { at: expected * 0.75, text: "Game engine working out harvests, hunger, births, and raids" },
  ];
  const active = steps.reduce((a, s, i) => (elapsed >= s.at ? i : a), 0);
  return (
    <div className="deciding-status" role="status" aria-live="polite">
      <div className="progress" aria-hidden="true">
        <span className={reducedMotion ? "" : "animated"} style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i} className={i < active ? "done" : i === active ? "active" : "todo"}>
            <span className="mark" aria-hidden="true">{i < active ? "✓" : i === active ? "●" : "○"}</span>
            {s.text}
            {i === active && "…"}
          </li>
        ))}
      </ol>
      <div className="small muted">
        {(elapsed / 1000).toFixed(1)} s
        {elapsed > 8000 && mode === "live" ? " · Still waiting; Jev retries automatically if a call fails." : ""}
      </div>
    </div>
  );
}

"use client";

import { TRIBES } from "@/content/tribes";
import type { LogEntry } from "@/lib/client/useGame";

export default function EventLog({ entries, onInspect, filterTribe }: { entries: LogEntry[]; onInspect: (turn: number) => void; filterTribe?: string | null }) {
  if (entries.length === 0) return <p className="muted">No turns yet. The log records every environmental change, each tribe&apos;s action, and measured results.</p>;
  return (
    <div className="log" aria-live="polite">
      {entries.map((e) => (
        <div key={e.turn} className="log-turn">
          <h4>
            Turn {e.turn}
            <span className={`chip ${e.source === "nature" ? "badge-nature" : "badge-player"}`}>{e.source === "nature" ? "Nature" : "You"}</span>
            {e.eventTitle}: {e.optionLabel}
            <button type="button" className="btn btn-sm" onClick={() => onInspect(e.turn)}>Inspect decisions</button>
          </h4>
          <ul className="small">
            {e.outcomes
              .filter((o) => !filterTribe || o.tribeId === filterTribe || o.tribeId === null)
              .map((o, i) => (
                <li key={i}>
                  {o.tribeId && <span className="swatch" style={{ background: TRIBES[o.tribeId].color, marginRight: 5 }} aria-hidden="true" />}
                  {o.text}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

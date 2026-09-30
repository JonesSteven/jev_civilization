"use client";

import { TRIBES } from "@/content/tribes";
import { groupActivity } from "@/lib/client/labels";
import type { LogEntry } from "@/lib/client/useGame";

/** The turn's plain-language story: a headline, then one line per tribe that changed noticeably. */
export function TurnStory({ entry }: { entry: LogEntry }) {
  const s = entry.summary;
  if (!s) return null;
  const extra = s.lines.filter((l) => !l.inHeadline);
  return (
    <div className="turn-story">
      <p className="turn-headline">{s.headline}</p>
      {extra.length > 0 && (
        <ul className="plain-list small">
          {extra.map((l) => (
            <li key={l.tribeId}>
              <span className="swatch" style={{ background: TRIBES[l.tribeId].color, marginRight: 5 }} aria-hidden="true" />
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One line per tribe: its action in plain words and what came of it (scouting, raids, defending, unions…). */
export function TribeActivityList({ entry }: { entry: LogEntry }) {
  const activity = groupActivity(entry);
  if (activity.length === 0) return null;
  return (
    <ul className="plain-list small tribe-activity">
      {activity.map((a) => (
        <li key={a.tribeId}>
          <span className="swatch" style={{ background: TRIBES[a.tribeId].color, marginRight: 5 }} aria-hidden="true" />
          <strong>{TRIBES[a.tribeId].name}</strong> — {a.group}: {a.name}.{a.lines.length ? ` ${a.lines.join(" ")}` : ""}
        </li>
      ))}
    </ul>
  );
}

export default function EventLog({ entries, onInspect, filterTribe }: { entries: LogEntry[]; onInspect: (turn: number) => void; filterTribe?: string | null }) {
  if (entries.length === 0) return <p className="muted">No turns yet. Each turn gets a short summary of who gained or lost people and why; open Details for every measured result.</p>;
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
          <TurnStory entry={e} />
          <TribeActivityList entry={e} />
          <details className="log-details">
            <summary className="small muted">Details</summary>
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
          </details>
        </div>
      ))}
    </div>
  );
}

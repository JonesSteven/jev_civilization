"use client";

import { useState } from "react";
import type { EventCardView } from "@/lib/client/types";

interface Props {
  event: EventCardView;
  mode: "live" | "mock";
  busy: boolean;
  deciding: boolean;
  locked: boolean;
  paused: boolean;
  onPause: (v: boolean) => void;
  onConfirm: (optionId: string) => void;
}

export default function EventPanel({ event, mode, busy, deciding, locked, paused, onPause, onConfirm }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const isNature = event.source === "nature";
  // Nature's option is frozen server-side before the card is shown; reveal it directly.
  const chosenId = isNature ? event.natureOptionId : selected;
  const decider = mode === "mock" ? "the mock policy (not Jev)" : "Jev";

  return (
    <section className="panel panel-pad event-card" aria-labelledby="event-title">
      <div className="event-meta">
        <span className={`chip ${isNature ? "badge-nature" : "badge-player"}`}>{isNature ? "Nature chooses" : "Your choice"}</span>
        <span className="chip">Turn {event.turn}</span>
        <span className="chip" title="Every environmental choice applies to the whole map">Applies to: the whole land</span>
        {event.fallback && <span className="chip">Fallback event</span>}
      </div>
      <h2 id="event-title">{event.title}</h2>
      <div className="question">{event.question}</div>
      <div className="options" role="radiogroup" aria-label={event.question}>
        {event.options.map((o) => {
          const checked = chosenId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={checked}
              className={`option ${isNature && checked ? "nature-picked" : ""}`}
              disabled={isNature || locked}
              onClick={() => setSelected(o.id)}
            >
              <div className="label">
                <span>{o.label}</span>
                <span className="muted small">{o.duration > 0 ? `${o.duration} turn${o.duration > 1 ? "s" : ""}` : "one-time / permanent"}</span>
              </div>
              <div className="desc">{o.description}</div>
              <ul>{o.effects.map((e) => <li key={e}>{e}</li>)}</ul>
            </button>
          );
        })}
      </div>
      {!isNature && !deciding && (
        <div className="confirm-row">
          <button type="button" className="btn btn-primary" disabled={!selected || busy || locked} onClick={() => selected && onConfirm(selected)}>
            Confirm choice
          </button>
          <span className="small muted">Your choice is locked once confirmed. You cannot order any tribe.</span>
        </div>
      )}
      {isNature && !deciding && (
        <div className="confirm-row">
          {paused ? (
            <>
              <span className="small">Paused. Nature&apos;s pick is already fixed by the game seed; pausing only delays it.</span>
              <button type="button" className="btn" onClick={() => onPause(false)}>Resume</button>
            </>
          ) : (
            <>
              <span className="small muted">Nature picked {event.options.find((o) => o.id === chosenId)?.label ?? "…"} (uniform, seeded).</span>
              <button type="button" className="btn btn-sm" onClick={() => onPause(true)}>Pause</button>
            </>
          )}
        </div>
      )}
      {deciding && (
        <div className="deciding" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>The tribes are deciding with {decider}. You can keep inspecting the map.</span>
        </div>
      )}
    </section>
  );
}

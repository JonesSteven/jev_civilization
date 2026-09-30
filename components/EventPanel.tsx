"use client";

import { useState } from "react";
import { TRIBES } from "@/content/tribes";
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
        <span className="chip" title={event.regional ? "This event strikes only the highlighted region" : "This event applies to the whole map"}>
          {event.regional ? `Strikes ${event.footprintLabel}` : "Applies to: the whole land"}
        </span>
        {event.fallback && <span className="chip">Fallback event</span>}
      </div>
      <h2 id="event-title">{event.title}</h2>
      <div className="question">{event.question}</div>
      {event.regional && (
        <p className="small area-note">
          {event.tribesInArea.length
            ? <>Settlements in the region: {event.tribesInArea.map((id) => TRIBES[id].name).join(", ")}.</>
            : <>No settlements lie in the region; only the land there changes.</>}
        </p>
      )}
      <div className="options" role="radiogroup" aria-label={event.question}>
        {event.options.map((o) => {
          const checked = chosenId === o.id;
          return (
            <div key={o.id} className="option-wrap">
              <button
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
                <div className="impact small">
                  {o.impact.helps.length > 0 && <span className="impact-helps">Likely helps: {o.impact.helps.map((id) => TRIBES[id].name).join(", ")}</span>}
                  {o.impact.hurts.length > 0 && <span className="impact-hurts">Likely hurts: {o.impact.hurts.map((id) => TRIBES[id].name).join(", ")}</span>}
                  {o.impact.helps.length === 0 && o.impact.hurts.length === 0 && <span className="muted">Little direct effect on any tribe</span>}
                </div>
              </button>
              <details className="effect-details">
                <summary className="small muted">Details: exact effects of {o.label}</summary>
                <ul className="small">{o.effects.map((e) => <li key={e}>{e}</li>)}</ul>
              </details>
            </div>
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

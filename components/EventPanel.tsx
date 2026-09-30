"use client";

import { useState } from "react";
import { TRIBES } from "@/content/tribes";
import type { EventCardView } from "@/lib/client/types";
import DecidingStatus from "./DecidingStatus";

/** What the deciding status line needs to describe the turn in progress. */
export interface StatusInfo {
  since: number | null;
  model: string;
  tribeNames: string[];
  reducedMotion: boolean;
}

interface Props {
  event: EventCardView;
  mode: "live" | "mock";
  busy: boolean;
  deciding: boolean;
  locked: boolean;
  status: StatusInfo;
  onConfirm: (optionId: string) => void;
}

/** The card header: who chooses, the turn, and where the event strikes. */
export function EventHeader({ event, badge }: { event: EventCardView; badge: string }) {
  return (
    <>
      <div className="event-meta">
        <span className={`chip ${event.source === "nature" ? "badge-nature" : "badge-player"}`}>{badge}</span>
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
    </>
  );
}

/** The three options with their forecasts. `chosenId` marks the selected (or Nature's) option. */
export function OptionList({ event, chosenId, disabled, pickedLabel, onSelect }: { event: EventCardView; chosenId: string | null; disabled: boolean; pickedLabel?: string; onSelect?: (id: string) => void }) {
  return (
    <div className="options" role="radiogroup" aria-label={event.question}>
      {event.options.map((o) => {
        const checked = chosenId === o.id;
        return (
          <div key={o.id} className="option-wrap">
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              className={`option ${pickedLabel && checked ? "nature-picked" : ""}`}
              disabled={disabled}
              onClick={() => onSelect?.(o.id)}
            >
              <div className="label">
                <span>{o.label}{pickedLabel && checked ? <span className="chip badge-nature picked-chip">{pickedLabel}</span> : null}</span>
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
  );
}

export default function EventPanel({ event, mode, busy, deciding, locked, status, onConfirm }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const isNature = event.source === "nature";
  // Nature's option is frozen server-side before the card is shown; reveal it directly.
  const chosenId = isNature ? event.natureOptionId : selected;
  const chosenLabel = event.options.find((o) => o.id === chosenId)?.label ?? "";

  return (
    <section className="panel panel-pad event-card" aria-labelledby="event-title">
      <EventHeader event={event} badge={isNature ? "Nature chooses" : "Your choice"} />
      <OptionList event={event} chosenId={chosenId} disabled={isNature || locked} pickedLabel={isNature ? "Nature's pick" : undefined} onSelect={setSelected} />
      {!isNature && !deciding && (
        <div className="confirm-row">
          <button type="button" className="btn btn-primary" disabled={!selected || busy || locked} onClick={() => selected && onConfirm(selected)}>
            Confirm choice
          </button>
          <span className="small muted">Your choice is locked once confirmed. You cannot order any tribe.</span>
        </div>
      )}
      {deciding && (
        <DecidingStatus
          since={status.since}
          mode={mode}
          model={status.model}
          tribeNames={status.tribeNames}
          choice={isNature ? `Nature chose ${chosenLabel}` : `You chose ${chosenLabel || "an option"}`}
          reducedMotion={status.reducedMotion}
        />
      )}
    </section>
  );
}

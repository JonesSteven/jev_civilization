"use client";

import { useEffect, useRef } from "react";
import { TRIBES } from "@/content/tribes";
import { plainAction } from "@/lib/client/labels";
import type { TurnRecord } from "@/lib/client/types";
import { logFromRecord, type NatureReview as Review } from "@/lib/client/useGame";
import DecidingStatus from "./DecidingStatus";
import { TurnStory } from "./EventLog";
import { EventHeader, OptionList, type StatusInfo } from "./EventPanel";

/** One resolved turn: its summary and what each tribe chose. */
function TurnResult({ record, heading }: { record: TurnRecord; heading: string }) {
  return (
    <div className="review-turn">
      <h3>{heading}</h3>
      <TurnStory entry={logFromRecord(record)} />
      <ul className="plain-list small tribe-choices">
        {record.decisions.map((d) => {
          const kind = d.offered.find((o) => o.id === d.selected)?.kind ?? "";
          const a = plainAction(kind);
          return (
            <li key={d.tribeId}>
              <span className="swatch" style={{ background: TRIBES[d.tribeId].color, marginRight: 5 }} aria-hidden="true" />
              <strong>{TRIBES[d.tribeId].name}</strong>: {a.group} — {a.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Nature's turn, held for the player: Nature's pick is shown at once, the tribes decide immediately, and the player
 * reads what happened before proceeding to their own choice.
 */
export default function NatureReview({ review, mode, status, deciding, finished, onProceed }: { review: Review; mode: "live" | "mock"; status: StatusInfo; deciding: boolean; finished: boolean; onProceed: () => void }) {
  const { event, record, previous } = review;
  const picked = event.options.find((o) => o.id === event.natureOptionId);
  const proceedRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (record) proceedRef.current?.focus();
  }, [record]);
  return (
    <section className="panel panel-pad event-card nature-review" aria-labelledby="event-title">
      <EventHeader event={event} badge="Nature chose" />
      <OptionList event={event} chosenId={event.natureOptionId} disabled pickedLabel="Nature's pick" />
      {!record && deciding && (
        <DecidingStatus since={status.since} mode={mode} model={status.model} tribeNames={status.tribeNames} choice={`Nature chose ${picked?.label ?? "…"}`} reducedMotion={status.reducedMotion} />
      )}
      {record && (
        <div className="review-results">
          <div className="section-title">What happened</div>
          {previous && <TurnResult record={previous} heading={`Turn ${previous.turn} · your choice: ${previous.optionLabel}`} />}
          <TurnResult record={record} heading={`Turn ${record.turn} · Nature's choice: ${record.optionLabel}`} />
          <div className="confirm-row">
            <button ref={proceedRef} type="button" className="btn btn-primary" onClick={onProceed}>
              {finished ? "See the final results" : "Proceed to my turn"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

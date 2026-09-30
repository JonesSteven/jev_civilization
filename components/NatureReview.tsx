"use client";

import { useEffect, useRef } from "react";
import type { NatureReview as Review } from "@/lib/client/useGame";
import DecidingStatus from "./DecidingStatus";
import { EventHeader, OptionList, type StatusInfo } from "./EventPanel";

/**
 * Nature's turn, held for the player: Nature's pick is shown at once, the tribes decide immediately, and the player
 * reads the results in the event log before proceeding to their own choice.
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
        <div className="confirm-row">
          <button ref={proceedRef} type="button" className="btn btn-primary" onClick={onProceed}>
            {finished ? "See the final results" : "Proceed to my turn"}
          </button>
          <span className="small muted">What happened on turn {record.turn}{previous ? ` and turn ${previous.turn}` : ""} is in the event log.</span>
        </div>
      )}
    </section>
  );
}

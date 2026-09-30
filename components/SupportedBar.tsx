"use client";

import { BALANCE, STARTING } from "@/content/balance";
import { TRIBES } from "@/content/tribes";
import { fateText, plainAction } from "@/lib/client/labels";
import type { TribePanel } from "@/lib/client/types";

function statusClass(s: string | undefined) {
  if (s === "critically low") return "status-bad";
  if (s === "low") return "status-warn";
  return "status-good";
}

/** Screen-wide summary of the tribe the player supports, shown under the header. */
export default function SupportedBar({ tribe, rank, living, onDetails, onFocus }: { tribe: TribePanel; rank: number; living: number; onDetails: () => void; onFocus: () => void }) {
  const p = TRIBES[tribe.id];
  const f = tribe.foodOutlook;
  const s = tribe.shelter;
  const last = tribe.recentActions[tribe.recentActions.length - 1];
  const prev = tribe.history.length >= 2 ? (tribe.history[tribe.history.length - 2] as TribePanel["history"][number]).population : STARTING.population;
  const trend = tribe.history.length >= 1 && prev > 0 ? (tribe.population - prev) / prev : null;
  return (
    <section className="supported-bar" aria-label={`Your tribe: ${p.name}`} style={{ borderLeftColor: p.color }}>
      <div className="sb-name">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="emblem" src={p.symbol} alt="" />
        <div>
          <div className="sb-title">{p.name} <span className="supported-star" aria-hidden="true">★</span></div>
          <div className="small muted">Your tribe{tribe.alive ? ` · rank ${rank} of ${living}` : ""}</div>
        </div>
      </div>
      {!tribe.alive ? (
        <div className="sb-item sb-gone">{p.name} {fateText(tribe)}.</div>
      ) : (
        <>
          <div className="sb-item">
            <span>People</span>
            <strong>
              {tribe.population.toLocaleString("en-US")}
              {trend !== null && Math.abs(trend) >= 0.005 ? <span className={`pop-delta ${trend > 0 ? "up" : "down"}`}>{trend > 0 ? "▲" : "▼"}{Math.abs(Math.round(trend * 100))}%</span> : null}
            </strong>
          </div>
          <div className="sb-item">
            <span>Food</span>
            <strong className={statusClass(f?.status)}>{f ? `${f.status} · ${f.coverageTurns.toFixed(1)} turns` : "—"}</strong>
          </div>
          <div className="sb-item">
            <span>Shelter</span>
            <strong className={s && s.unsheltered > 0 ? "status-warn" : ""}>{s ? (s.unsheltered > 0 ? `${s.unsheltered.toLocaleString("en-US")} unsheltered` : "everyone housed") : "—"}</strong>
          </div>
          <div className="sb-item">
            <span>Morale</span>
            <strong>{tribe.moraleLevel}{tribe.morale < BALANCE.population.birthMinMorale ? " · no births" : ""}</strong>
          </div>
          <div className="sb-item">
            <span>Now doing</span>
            <strong>{last ? `${plainAction(last.kind).group}: ${plainAction(last.kind).name}` : "—"}</strong>
          </div>
          <div className="sb-item">
            <span>Knowledge</span>
            <strong>{tribe.technologies.length ? `${tribe.technologies.length} tech${tribe.technologies.length > 1 ? "s" : ""}` : "none yet"}{tribe.project ? ` · researching ${tribe.project.name}` : ""}</strong>
          </div>
          <div className="sb-item">
            <span>Settlements</span>
            <strong>{1 + tribe.outposts.length}</strong>
          </div>
          <div className="sb-item">
            <span>Score</span>
            <strong>{tribe.score.total.toFixed(1)}</strong>
          </div>
        </>
      )}
      <div className="sb-actions">
        <button type="button" className="btn btn-sm" onClick={onDetails}>Details</button>
        <button type="button" className="btn btn-sm" onClick={onFocus} disabled={!tribe.alive}>Show on map</button>
      </div>
    </section>
  );
}

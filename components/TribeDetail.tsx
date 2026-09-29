"use client";

import { TRIBES } from "@/content/tribes";
import type { TribePanel } from "@/lib/client/types";

function statusClass(s: string | undefined) {
  if (s === "critically low") return "status-bad";
  if (s === "low") return "status-warn";
  return "status-good";
}

export default function TribeDetail({ tribe, supported, onFocus, currentTurn }: { tribe: TribePanel; supported: boolean; onFocus: () => void; currentTurn: number }) {
  const p = TRIBES[tribe.id];
  const f = tribe.foodOutlook;
  const s = tribe.shelter;
  return (
    <section className="panel panel-pad tribe-detail" aria-labelledby="tribe-detail-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 id="tribe-detail-title" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="emblem" src={p.symbol} alt="" /> {p.name}
          {supported && <span className="chip badge-player">Supported</span>}
        </h2>
        <button type="button" className="btn btn-sm" onClick={onFocus} disabled={!tribe.alive}>Show on map</button>
      </div>
      {!tribe.alive ? (
        <p className="muted" style={{ marginTop: 8 }}>Disappeared on turn {tribe.eliminatedTurn}. Its remaining assets are ruins.</p>
      ) : (
        <>
          <div className="section-title">Condition</div>
          <div className="stats">
            <div className="stat"><span>Population</span><strong>{tribe.population}</strong></div>
            <div className="stat"><span>Morale</span><strong>{tribe.morale} ({tribe.moraleLevel})</strong></div>
            <div className="stat"><span>Food</span><strong>{tribe.food}</strong></div>
            <div className="stat"><span>Food turns left</span><strong className={statusClass(f?.status)}>{f ? `${f.coverageTurns.toFixed(1)} (${f.status})` : "—"}</strong></div>
            <div className="stat"><span>Food income / use</span><strong>{f ? `${f.expectedIncome} / ${f.consumption}` : "—"}</strong></div>
            <div className="stat"><span>Timber / stone</span><strong>{tribe.timber} / {tribe.stone}</strong></div>
            <div className="stat"><span>Shelter capacity</span><strong>{s ? `${s.usableCapacity} usable` : "—"}</strong></div>
            <div className="stat"><span>Shelter condition</span><strong className={s && s.averageCondition < 60 ? "status-warn" : ""}>{s ? `${s.averageCondition}%` : "—"}</strong></div>
            <div className="stat"><span>Shelter coverage</span><strong className={s && s.coverage < 1 ? "status-warn" : ""}>{s ? `${Math.round(s.coverage * 100)}%` : "—"}</strong></div>
            <div className="stat"><span>Military / defenses</span><strong>{tribe.militaryLevel} / {tribe.fortification} (cap {tribe.fortificationCap})</strong></div>
            <div className="stat"><span>Sites (farm/hunt/fish)</span><strong>{tribe.sites.farms}/{tribe.sites.hunts}/{tribe.sites.fisheries}</strong></div>
            <div className="stat"><span>Labor coverage</span><strong>{Math.round(tribe.sites.laborCoverage * 100)}%</strong></div>
            <div className="stat"><span>Claimed / productive tiles</span><strong>{tribe.claimedTiles} / {tribe.productiveTiles}</strong></div>
            <div className="stat"><span>Dormant assets</span><strong>{tribe.sites.dormant}</strong></div>
          </div>
          <div className="section-title">Settlements</div>
          <p className="small">
            {1 + tribe.outposts.length} of 3 (capital{tribe.outposts.length ? ` + ${tribe.outposts.length} outpost${tribe.outposts.length > 1 ? "s" : ""}` : ""})
            {tribe.scoutedSites.length > 0 && (
              <> · Scouts report: {tribe.scoutedSites.map((x) => `${x.terrain} site ${x.distance} units away (food potential ${x.food}, turn ${x.foundTurn})`).join("; ")}</>
            )}
          </p>
          <div className="section-title">Technologies</div>
          <p>{tribe.technologies.length ? tribe.technologies.join(", ") : "None learned yet"}{tribe.project ? ` · Researching ${tribe.project.name} (${tribe.project.progress}/${tribe.project.required})` : ""}</p>
          <div className="section-title">Score {tribe.score.total.toFixed(1)}</div>
          <p className="small num">
            Population {tribe.score.population.toFixed(1)}/40 · Resilience {tribe.score.resilience.toFixed(1)}/25 · Development {tribe.score.development.toFixed(1)}/20 · Influence {tribe.score.influence.toFixed(1)}/15
          </p>
          <div className="section-title">Recent actions</div>
          {tribe.recentActions.length ? (
            <ul className="plain-list small">
              {[...tribe.recentActions].reverse().slice(0, 4).map((a) => (
                <li key={`${a.turn}-${a.label}`}>Turn {a.turn}: {a.kind.replace(/_/g, " ")} <span className="muted mono">({a.label})</span></li>
              ))}
            </ul>
          ) : <p className="small muted">None yet.</p>}
          {tribe.memory.length > 0 && (
            <>
              <div className="section-title">Memories (sent to Jev)</div>
              <ul className="plain-list small">
                {[...tribe.memory].reverse().map((m) => <li key={`${m.turn}-${m.text}`}>{m.text} <span className="muted">({currentTurn - m.turn <= 1 ? "recent" : `${currentTurn - m.turn} turns ago`})</span></li>)}
              </ul>
            </>
          )}
          <div className="section-title">Relations</div>
          <p className="small">{tribe.relations.map((r) => `${TRIBES[r.id].name}: ${r.label} (${r.value})`).join(" · ")}</p>
        </>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { TRIBES } from "@/content/tribes";
import type { GameView } from "@/lib/client/types";
import type { LogEntry } from "@/lib/client/useGame";
import PopulationChart from "./PopulationChart";

export default function Results({ game, log, onInspect }: { game: GameView; log: LogEntry[]; onInspect: (turn: number) => void }) {
  const ranked = [...game.tribes].sort((a, b) => b.score.total - a.score.total);
  const winners = game.winners ?? [];
  const supported = game.tribes.find((t) => t.id === game.supportedTribeId);
  const place = ranked.findIndex((t) => t.id === game.supportedTribeId) + 1;
  const shared = winners.length > 1;
  const abandoned = game.status === "abandoned";
  const isMock = game.mode === "mock";

  let headline: string;
  if (abandoned) headline = `Viewing ended on turn ${game.completedTurn}. The remaining turns were not simulated, so there is no final ranking.`;
  else if (winners.length === 0) headline = "No tribe survived to turn 100. There is no surviving winner.";
  else if (winners.includes(game.supportedTribeId)) headline = shared ? `${TRIBES[game.supportedTribeId].name} shares the victory with an exactly equal top score.` : `${TRIBES[game.supportedTribeId].name} wins with the highest civilization score.`;
  else headline = `${winners.map((w) => TRIBES[w].name).join(" and ")} ${shared ? "share the victory" : "wins"}. ${TRIBES[game.supportedTribeId].name} ${supported?.alive ? `finished in place ${place}` : "did not survive"}.`;

  return (
    <section className="panel panel-pad" aria-labelledby="results-title">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 id="results-title" style={{ margin: 0 }}>{abandoned ? "Match ended early" : "Final results after 100 turns"}</h2>
        <span className={`chip ${isMock ? "badge-mock" : "badge-live"}`}>{isMock ? "Mock simulation — not Jev" : "Live Jev decisions"}</span>
      </div>
      <p style={{ fontSize: 16, marginTop: 8 }}>{headline}</p>
      {!abandoned && (
        <div className="results-grid">
          <div>
            <h3>Ranking</h3>
            <table className="ranking">
              <thead><tr><th>#</th><th>Tribe</th><th>Pop.</th><th>Resil.</th><th>Devel.</th><th>Infl.</th><th>Total</th></tr></thead>
              <tbody>
                {ranked.map((t, i) => (
                  <tr key={t.id} className={t.id === game.supportedTribeId ? "selected-row" : ""}>
                    <td>{t.score.total > 0 ? i + 1 : "—"}</td>
                    <td>
                      <span className="swatch" style={{ background: TRIBES[t.id].color, marginRight: 6 }} />
                      {TRIBES[t.id].name}{winners.includes(t.id) ? " 🏆" : ""}{!t.alive ? " (gone)" : ""}
                    </td>
                    <td>{t.score.population.toFixed(1)}</td>
                    <td>{t.score.resilience.toFixed(1)}</td>
                    <td>{t.score.development.toFixed(1)}</td>
                    <td>{t.score.influence.toFixed(1)}</td>
                    <td><strong>{t.score.total.toFixed(1)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">Maximums: population 40, resilience 25, development 20, influence 15. Ranking uses full precision; exact ties share the win.</p>
            <h3 style={{ marginTop: 12 }}>Technology milestones</h3>
            <ul className="plain-list small">
              {game.tribes.flatMap((t) => t.milestones.map((m) => ({ ...m, id: t.id }))).sort((a, b) => a.turn - b.turn).map((m) => (
                <li key={`${m.id}-${m.turn}-${m.text}`}>Turn {m.turn}: {TRIBES[m.id].name} — {m.text}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Population history</h3>
            <PopulationChart tribes={game.tribes} />
          </div>
        </div>
      )}
      <h3 style={{ marginTop: 14 }}>Timeline</h3>
      <div className="timeline">
        <table>
          <thead><tr><th>Turn</th><th>Environment</th>{game.tribes.map((t) => <th key={t.id}>{TRIBES[t.id].name}</th>)}<th></th></tr></thead>
          <tbody>
            {[...log].sort((a, b) => a.turn - b.turn).map((e) => (
              <tr key={e.turn}>
                <td>{e.turn} <span className="muted">{e.source === "nature" ? "N" : "P"}</span></td>
                <td>{e.eventTitle}: {e.optionLabel}</td>
                {game.tribes.map((t) => {
                  const d = e.decisions.find((x) => x.tribeId === t.id);
                  return <td key={t.id}>{d ? d.kind.replace(/_/g, " ") : "—"}</td>;
                })}
                <td><button type="button" className="btn btn-sm" onClick={() => onInspect(e.turn)}>Inspect</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dialog-actions">
        <a className="btn" href={`/api/games/${game.id}/export`}>Export JSON</a>
        <Link className="btn" href={`/game/${game.id}/replay`}>Replay match</Link>
        <Link className="btn btn-primary" href="/">New match</Link>
      </div>
    </section>
  );
}

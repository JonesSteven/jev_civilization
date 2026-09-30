"use client";

import { BALANCE, STARTING } from "@/content/balance";
import { TRIBES } from "@/content/tribes";
import { fateChip } from "@/lib/client/labels";
import type { TribePanel } from "@/lib/client/types";
import type { TribeId } from "@/lib/game/types";

const S = BALANCE.score;
const COMPONENTS = [
  { key: "population", label: "Population", max: S.population.weight, color: "#8a5a1c" },
  { key: "resilience", label: "Resilience", max: S.resilience.weight, color: "#b98a4a" },
  { key: "development", label: "Development", max: S.development.weight, color: "#6d7f3a" },
  { key: "influence", label: "Influence", max: S.influence.weight, color: "#a3a07a" },
] as const;

/** Population change since the previous turn, as a signed percentage. */
function popChange(t: TribePanel): number | null {
  const h = t.history;
  if (h.length < 1 || !t.alive) return null;
  const prev = h.length >= 2 ? (h[h.length - 2] as TribePanel["history"][number]).population : STARTING.population;
  if (prev <= 0) return null;
  return (t.population - prev) / prev;
}

export default function Scoreboard({ tribes, supported, selected, onSelect }: { tribes: TribePanel[]; supported: TribeId; selected: TribeId | null; onSelect: (id: TribeId) => void }) {
  const sorted = [...tribes].sort((a, b) => Number(b.alive) - Number(a.alive) || b.score.total - a.score.total);
  return (
    <section className="panel panel-pad scoreboard" aria-labelledby="score-title">
      <h2 id="score-title">Tribes</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Tribe</th>
            <th scope="col" title="Population">Pop</th>
            <th scope="col" title="Turns of food at current population">Food</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr
              key={t.id}
              className="selectable"
              aria-selected={selected === t.id}
              tabIndex={0}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(t.id))}
            >
              <td>
                <div className="tname">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="emblem" src={TRIBES[t.id].symbol} alt="" />
                  {TRIBES[t.id].name}
                  {t.id === supported && <span className="supported-star" title="You support this tribe" aria-label="supported">★</span>}
                  {!t.alive && <span className="chip">{fateChip(t)}</span>}
                </div>
                {t.alive && (
                  <div className="score-bar" aria-hidden="true">
                    {COMPONENTS.map((c) => (
                      <span key={c.key} style={{ width: `${(t.score[c.key] / 100) * 100}%`, background: c.color }} title={`${c.label} ${t.score[c.key].toFixed(1)}/${c.max}`} />
                    ))}
                  </div>
                )}
              </td>
              <td className="num">
                {t.alive ? t.population.toLocaleString("en-US") : "—"}
                {(() => {
                  const c = popChange(t);
                  if (c === null || Math.abs(c) < 0.005) return null;
                  return (
                    <span className={`pop-delta ${c > 0 ? "up" : "down"}`} title="Change since last turn">
                      {c > 0 ? "▲" : "▼"}{Math.abs(Math.round(c * 100))}%
                    </span>
                  );
                })()}
              </td>
              <td className="num">{t.foodOutlook ? t.foodOutlook.coverageTurns.toFixed(1) : "—"}</td>
              <td className="num"><strong>{t.score.total.toFixed(1)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="chart-legend" aria-label="Score components">
        {COMPONENTS.map((c) => (
          <span key={c.key}><span className="swatch" style={{ background: c.color, borderRadius: 2 }} />{c.label} (max {c.max})</span>
        ))}
      </div>
    </section>
  );
}

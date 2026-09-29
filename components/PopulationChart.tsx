"use client";

import { useMemo, useRef, useState } from "react";
import { TRIBES } from "@/content/tribes";
import type { TribePanel } from "@/lib/client/types";

const WIDTH = 560;
const HEIGHT = 240;
const M = { top: 12, right: 86, bottom: 28, left: 40 };

function niceMax(v: number): number {
  const step = v <= 50 ? 10 : v <= 200 ? 25 : v <= 600 ? 100 : 250;
  return Math.max(step, Math.ceil(v / step) * step);
}

/** Population per tribe over turns. One axis; legend + selective end labels; crosshair tooltip; table view. */
export default function PopulationChart({ tribes }: { tribes: TribePanel[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const maxTurn = Math.max(1, ...tribes.flatMap((t) => t.history.map((h) => h.turn)));
  const maxPop = niceMax(Math.max(100, ...tribes.flatMap((t) => t.history.map((h) => h.population))));
  const x = (turn: number) => M.left + ((turn - 0) / maxTurn) * (WIDTH - M.left - M.right);
  const y = (p: number) => M.top + (1 - p / maxPop) * (HEIGHT - M.top - M.bottom);
  const series = useMemo(
    () =>
      tribes.map((t) => ({
        id: t.id,
        points: [{ turn: 0, population: 100 }, ...t.history.map((h) => ({ turn: h.turn, population: h.population }))],
      })),
    [tribes],
  );
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((maxPop / 4) * i));
  const step = maxTurn <= 30 ? 5 : maxTurn <= 60 ? 10 : maxTurn <= 120 ? 25 : 50;
  const turnTicks = Array.from({ length: Math.floor(maxTurn / step) + 1 }, (_, i) => i * step);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const turn = Math.round(((px - M.left) / (WIDTH - M.left - M.right)) * maxTurn);
    setHover(Math.max(0, Math.min(maxTurn, turn)));
  };

  // End labels, nudged apart so they never collide.
  const ends = series
    .map((s) => ({ id: s.id, last: s.points[s.points.length - 1] as { turn: number; population: number } }))
    .sort((a, b) => y(a.last.population) - y(b.last.population));
  const labelY: Record<string, number> = {};
  let prev = -Infinity;
  for (const e of ends) {
    const yy = Math.max(y(e.last.population), prev + 13);
    labelY[e.id] = yy;
    prev = yy;
  }

  return (
    <div className="chart-wrap">
      <div className="chart-legend" aria-hidden="true">
        {tribes.map((t) => (
          <span key={t.id}><span className="swatch" style={{ background: TRIBES[t.id].color }} />{TRIBES[t.id].name}</span>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setShowTable(!showTable)} style={{ marginLeft: "auto" }}>{showTable ? "Chart" : "Table"} view</button>
      </div>
      {showTable ? (
        <div style={{ maxHeight: 260, overflow: "auto" }}>
          <table className="ranking">
            <thead><tr><th>Turn</th><th></th>{tribes.map((t) => <th key={t.id}>{TRIBES[t.id].name}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: Math.ceil(maxTurn / 5) + 1 }, (_, i) => Math.min(maxTurn, i * 5)).filter((v, i, a) => a.indexOf(v) === i).map((turn) => (
                <tr key={turn}><td>{turn}</td><td></td>{series.map((s) => <td key={s.id}>{s.points.find((p) => p.turn === turn)?.population ?? "—"}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="Population of each tribe by turn" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={WIDTH - M.right} y1={y(t)} y2={y(t)} stroke="#e6dcc6" strokeWidth={1} />
              <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#85775f">{t}</text>
            </g>
          ))}
          {turnTicks.map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="#85775f">{t === 0 ? "Start" : `Turn ${t}`}</text>
          ))}
          {series.map((s) => (
            <polyline
              key={s.id}
              fill="none"
              stroke={TRIBES[s.id].color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.points.map((p) => `${x(p.turn)},${y(p.population)}`).join(" ")}
            />
          ))}
          {ends.map((e) => (
            <g key={e.id}>
              <circle cx={x(e.last.turn)} cy={y(e.last.population)} r={4} fill={TRIBES[e.id].color} stroke="#fffaf0" strokeWidth={2} />
              <text x={x(e.last.turn) + 8} y={labelY[e.id]} dominantBaseline="middle" fontSize={11} fill="#2c2418">{TRIBES[e.id].name} {e.last.population}</text>
            </g>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={HEIGHT - M.bottom} stroke="#85775f" strokeWidth={1} />
              {series.map((s) => {
                const p = s.points.find((q) => q.turn === hover);
                return p ? <circle key={s.id} cx={x(hover)} cy={y(p.population)} r={4} fill={TRIBES[s.id].color} stroke="#fffaf0" strokeWidth={2} /> : null;
              })}
            </g>
          )}
        </svg>
      )}
      {hover !== null && !showTable && (
        <div className="chart-tooltip" style={{ left: `${Math.min(70, (x(hover) / WIDTH) * 100)}%`, top: 30 }}>
          <div><strong>{hover === 0 ? "Start" : `Turn ${hover}`}</strong></div>
          {series.map((s) => {
            const p = s.points.find((q) => q.turn === hover);
            return (
              <div key={s.id}>
                <span className="swatch" style={{ background: TRIBES[s.id].color, marginRight: 5 }} />
                {TRIBES[s.id].name}: {p ? p.population : "—"}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

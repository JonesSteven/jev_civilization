"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/client/prefs";
import { TRIBES } from "@/content/tribes";
import type { TribeId } from "@/lib/game/types";
import { api, ClientApiError } from "@/lib/client/api";
import type { ReplayData } from "@/lib/client/types";
import { animationsFor } from "@/lib/client/useGame";
import { applyDelta, decodeWorld, type DecodedWorld } from "@/lib/client/world";
import MapCanvas, { type MapAnimation, type MapHandle } from "./MapCanvas";

/** Replays recorded decisions and events. It applies stored deltas only and never calls a model. */
export default function ReplayScreen({ gameId }: { gameId: string }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0); // 0 = initial world, n = after turn n
  const [playing, setPlaying] = useState(false);
  const mapRef = useRef<MapHandle | null>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    api.replay(gameId).then(setData, (e: unknown) => setError(e instanceof ClientApiError ? e.message : "Could not load replay."));
  }, [gameId]);

  const worlds = useMemo<DecodedWorld[]>(() => {
    if (!data) return [];
    const out = [decodeWorld(data.initial.world)];
    for (const t of data.turns) out.push(applyDelta(out[out.length - 1] as DecodedWorld, t.delta));
    return out;
  }, [data]);

  const isPlaying = playing && data !== null && index < data.turns.length;
  useEffect(() => {
    if (!isPlaying) return;
    const t = window.setTimeout(() => setIndex((i) => i + 1), 900);
    return () => window.clearTimeout(t);
  }, [isPlaying, index]);

  const turn = data && index > 0 ? data.turns[index - 1] : null;
  const anim = useMemo<{ id: number; items: MapAnimation[]; durationMs: number } | null>(
    () => (turn ? { id: turn.turn, items: animationsFor(turn.outcomes, turn.footprint), durationMs: 700 } : null),
    [turn],
  );

  if (error) return <main className="start"><div className="error-box" role="alert">{error}</div><Link href="/">Return to menu</Link></main>;
  if (!data || worlds.length === 0) return <main className="start"><div className="deciding"><span className="spinner" aria-hidden="true" /> Loading replay…</div></main>;

  const world = worlds[index] as DecodedWorld;
  const tribes = turn ? turn.tribes : data.initial.tribes.map((t) => ({ id: t.id, alive: t.alive, population: t.population, food: t.food, settlement: t.settlement }));
  const settlements = tribes.map((t) => ({ id: t.id as TribeId, tile: t.settlement, alive: t.alive }));
  const isMock = data.game.mode === "mock";

  return (
    <div className="game">
      <header className="topbar">
        <span className="title">Jev Civilizations</span>
        <span className="chip badge-replay">REPLAY</span>
        <span className={`chip ${isMock ? "badge-mock" : "badge-live"}`}>{isMock ? "Recorded mock simulation" : `Recorded live Jev (${data.game.configuredModel})`}</span>
        <strong>{index === 0 ? "Start" : `Turn ${index} of ${data.turns.length}`}</strong>
        <span className="spacer" />
        <Link className="btn btn-sm" href={`/game/${gameId}`}>Back to match</Link>
        <Link className="btn btn-sm" href="/">Menu</Link>
      </header>
      <div className="game-main">
        <div className="left-col">
          <section className="panel map-panel">
            <div className="map-toolbar" role="group" aria-label="Replay controls">
              <button type="button" className="btn btn-sm" onClick={() => setIndex(0)} disabled={index === 0}>⏮ Start</button>
              <button type="button" className="btn btn-sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>◀ Prev</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { if (!isPlaying && index >= data.turns.length) setIndex(0); setPlaying(!isPlaying); }} aria-pressed={isPlaying}>{isPlaying ? "⏸ Pause" : "▶ Play"}</button>
              <button type="button" className="btn btn-sm" onClick={() => setIndex((i) => Math.min(data.turns.length, i + 1))} disabled={index >= data.turns.length}>Next ▶</button>
              <label className="small" style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
                <span className="sr-only">Seek turn</span>
                <input type="range" min={0} max={data.turns.length} value={index} onChange={(e) => setIndex(Number(e.target.value))} style={{ flex: 1 }} aria-label="Seek turn" />
              </label>
            </div>
            <MapCanvas
              world={world}
              settlements={settlements}
              overlay="none"
              showOwnership
              footprint={turn ? turn.footprint : undefined}
              selectedTile={null}
              supportedTribe={data.game.supportedTribeId}
              onSelectTile={() => undefined}
              animations={anim}
              reducedMotion={reduced}
              handleRef={mapRef}
              initialFocus={data.initial.tribes.map((t) => t.settlement)}
              label="Replay map"
            />
          </section>
          <p className="small muted">{data.replayNote}</p>
        </div>
        <div className="right-col">
          <section className="panel panel-pad">
            {turn ? (
              <>
                <h2>Turn {turn.turn}: {turn.eventTitle}</h2>
                <p><span className={`chip ${turn.source === "nature" ? "badge-nature" : "badge-player"}`}>{turn.source === "nature" ? "Nature" : "Player"}</span> {turn.optionLabel} · {turn.footprintLabel}</p>
                <div className="section-title">Recorded decisions</div>
                <ul className="plain-list small">
                  {turn.decisions.map((d) => (
                    <li key={d.tribeId}>
                      <strong>{TRIBES[d.tribeId as TribeId].name}</strong>: <span className="mono">{d.selected}</span>
                      {d.selectedProbability !== null ? ` (${(d.selectedProbability * 100).toFixed(0)}%)` : ""}
                    </li>
                  ))}
                </ul>
                <div className="section-title">Outcomes</div>
                <ul className="plain-list small">{turn.outcomes.map((o, i) => <li key={i}>{o.text}</li>)}</ul>
              </>
            ) : (
              <p>The starting world. Press Play or Next to step through recorded turns.</p>
            )}
          </section>
          <section className="panel panel-pad scoreboard">
            <h2>Tribes</h2>
            <table>
              <thead><tr><th>Tribe</th><th>Pop</th><th>Food</th><th>Score</th></tr></thead>
              <tbody>
                {tribes.map((t) => (
                  <tr key={t.id}>
                    <td><div className="tname"><span className="swatch" style={{ background: TRIBES[t.id as TribeId].color }} />{TRIBES[t.id as TribeId].name}{t.id === data.game.supportedTribeId ? " ★" : ""}</div></td>
                    <td className="num">{t.population}</td>
                    <td className="num">{t.food}</td>
                    <td className="num">{turn ? (turn.scores[t.id as TribeId]?.total ?? 0).toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

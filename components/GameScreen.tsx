"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePref } from "@/lib/client/prefs";
import { TRIBES } from "@/content/tribes";
import type { TribeId } from "@/lib/game/types";
import { useGame } from "@/lib/client/useGame";
import { fateText } from "@/lib/client/labels";
import EventLog, { TurnStory } from "./EventLog";
import EventPanel from "./EventPanel";
import NatureReview from "./NatureReview";
import HelpDialog from "./HelpDialog";
import JevInspector from "./JevInspector";
import MapCanvas, { type MapHandle, type OverlayMode } from "./MapCanvas";
import Onboarding from "./Onboarding";
import Results from "./Results";
import Scoreboard from "./Scoreboard";
import TileInspector from "./TileInspector";
import TribeDetail from "./TribeDetail";

const SEASON_LABEL: Record<string, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };

export default function GameScreen({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const { game, world } = g;
  const mapRef = useRef<MapHandle | null>(null);
  const [overlay, setOverlay] = useState<OverlayMode>("none");
  const [showOwnership, setShowOwnership] = useState(true);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [selectedTribe, setSelectedTribe] = useState<TribeId | null>(null);
  const [bottomTab, setBottomTab] = useState<"log" | "inspector">("log");
  const [help, setHelp] = useState(false);
  const [onboarded, setOnboarded] = usePref("jc-onboarded", false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [dismissedElimination, setDismissedElimination] = useState(false);



  if (g.loadError) {
    return (
      <main className="start">
        <div className="error-box" role="alert">{g.loadError}</div>
        <p><Link href="/">Return to menu</Link></p>
      </main>
    );
  }
  if (!game || !world) {
    return (
      <main className="start" aria-busy="true">
        <div className="deciding"><span className="spinner" aria-hidden="true" /> Loading match…</div>
      </main>
    );
  }

  const deciding = game.status === "deciding" || game.status === "resolving" || g.busy;
  const finished = game.status === "finished" || game.status === "abandoned";
  const supported = game.tribes.find((t) => t.id === game.supportedTribeId);
  const allGone = game.tribes.every((t) => !t.alive);
  const showElimination = !finished && supported && !supported.alive && !dismissedElimination;
  const cal = game.calendar;
  const selectedTribeId = selectedTribe ?? game.supportedTribeId;
  const selTribe = game.tribes.find((t) => t.id === selectedTribeId) ?? game.tribes[0];
  const isMock = game.mode === "mock";
  const settlementAt = selectedTile !== null ? (game.tribes.find((t) => t.alive && (t.settlement === selectedTile || t.outposts.includes(selectedTile)))?.id ?? null) : null;
  const regionalFootprint = !finished && game.event?.regional ? game.event.footprint : undefined;
  const inFootprint = selectedTile !== null && !!regionalFootprint && regionalFootprint.includes(selectedTile);
  const lastEntry = g.log.length ? g.log.reduce((a, b) => (b.turn > a.turn ? b : a)) : null;
  const review = g.natureReview;
  const status = {
    since: g.decidingSince,
    model: game.configuredModel,
    tribeNames: game.tribes.filter((t) => t.alive).map((t) => TRIBES[t.id].name),
    reducedMotion: g.reducedMotion,
  };

  const closeOnboarding = () => setOnboarded(true);

  const inspectTurn = (turn: number) => {
    void g.selectTurnTrace(turn);
    setBottomTab("inspector");
  };

  return (
    <div className="game">
      <header className="topbar">
        <span className="title">Jev Civilizations</span>
        <span className={`chip ${isMock ? "badge-mock" : "badge-live"}`} title={isMock ? "Decisions come from a local test policy, not Jev" : `Decisions come from ${game.configuredModel}`}>
          {isMock ? "MOCK SIMULATION" : `LIVE · ${game.configuredModel}`}
        </span>
        <div className="turn-indicator" aria-live="polite">
          <strong>{finished ? `Turn ${game.completedTurn} of ${game.totalTurns}` : `Turn ${cal.turn} of ${game.totalTurns}`}</strong>
          {!finished && (
            <>
              <span>Year {cal.year} · {cal.phase === "early" ? "Early" : "Late"} {SEASON_LABEL[cal.season]}</span>
              <span className={`chip ${cal.source === "nature" ? "badge-nature" : "badge-player"}`}>{cal.source === "nature" ? "Nature's turn" : "Your turn"}</span>
            </>
          )}
          <span className="chip" style={{ background: TRIBES[game.supportedTribeId].color, color: "#fff", borderColor: TRIBES[game.supportedTribeId].colorDark }}>
            Supporting {TRIBES[game.supportedTribeId].name}
          </span>
        </div>
        <span className="spacer" />
        <label className="small" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          Speed
          <select value={g.speed} onChange={(e) => g.setSpeed(e.target.value as "normal" | "fast")} style={{ background: "#3c3223", color: "#f6ecd8", borderRadius: 6, border: "1px solid #5b4c35" }}>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </label>
        <label className="small" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" checked={g.reducedMotion} onChange={(e) => g.setReducedMotion(e.target.checked)} /> Reduced motion
        </label>
        <button type="button" className="btn btn-sm" onClick={() => setHelp(true)}>Help</button>
        {game.completedTurn > 0 && <a className="btn btn-sm" href={`/api/games/${game.id}/export`}>Export</a>}
        {!finished && <button type="button" className="btn btn-sm" onClick={() => setConfirmAbandon(true)}>End match</button>}
        <Link className="btn btn-sm" href="/">New game</Link>
      </header>

      <div className="game-main">
        <div className="left-col">
          <section className="panel map-panel" aria-label="World map">
            <div className="map-toolbar">
              <label className="small">
                Overlay{" "}
                <select value={overlay} onChange={(e) => setOverlay(e.target.value as OverlayMode)}>
                  <option value="none">Terrain only</option>
                  <option value="forage">Forage</option>
                  <option value="wildlife">Wildlife</option>
                  <option value="fish">Fish</option>
                  <option value="timber">Timber</option>
                  <option value="stone">Stone</option>
                  <option value="fertility">Fertility</option>
                </select>
              </label>
              <label className="small"><input type="checkbox" checked={showOwnership} onChange={(e) => setShowOwnership(e.target.checked)} /> Territory</label>
              <span className="spacer" style={{ flex: 1 }} />
              <span className="small muted">Focus:</span>
              {game.tribes.filter((t) => t.alive).map((t) => (
                <button key={t.id} type="button" className="btn btn-sm" onClick={() => { mapRef.current?.focusTile(t.settlement); setSelectedTribe(t.id); }}>
                  <span className="swatch" style={{ background: TRIBES[t.id].color }} aria-hidden="true" />{TRIBES[t.id].name}
                </button>
              ))}
            </div>
            <MapCanvas
              world={world}
              settlements={g.settlements}
              overlay={overlay}
              showOwnership={showOwnership}
              footprint={regionalFootprint ?? undefined}
              selectedTile={selectedTile}
              supportedTribe={game.supportedTribeId}
              onSelectTile={setSelectedTile}
              animations={g.animations}
              reducedMotion={g.reducedMotion}
              handleRef={mapRef}
              initialFocus={game.tribes.filter((t) => t.alive).map((t) => t.settlement)}
              label={`World map, 150 by 100 tiles. Circles are capitals, squares are outposts, dashed rings are scouted sites. Use arrow keys to pan, plus and minus to zoom, 0 to fit. Settlements: ${game.tribes.filter((t) => t.alive).map((t) => `${TRIBES[t.id].name} at ${t.settlement % 150}, ${Math.floor(t.settlement / 150)}`).join("; ")}.`}
            />
            <div className="legend-row" aria-hidden="true">
              <span><span className="swatch" style={{ background: "#5f93c4" }} />Water</span>
              <span><span className="swatch" style={{ background: "#a7c979" }} />Meadow</span>
              <span><span className="swatch" style={{ background: "#5f8f4a" }} />Forest</span>
              <span><span className="swatch" style={{ background: "#9d9587" }} />Mountain</span>
              <span>▦ farm · ◎ hunting site · ◁ fishery · ⌂ housing · ‖ defenses · ✕ ruin</span>
            </div>
          </section>
          {selectedTile !== null && (
            <TileInspector world={world} tile={selectedTile} inFootprint={inFootprint} settlementOf={settlementAt} onClose={() => setSelectedTile(null)} />
          )}
          {finished && <Results game={game} log={g.log} onInspect={inspectTurn} />}
          <section className="panel panel-pad">
            <div className="tabs" role="tablist" aria-label="Turn history">
              <button type="button" role="tab" aria-selected={bottomTab === "log"} onClick={() => setBottomTab("log")}>Event log</button>
              <button type="button" role="tab" aria-selected={bottomTab === "inspector"} onClick={() => setBottomTab("inspector")}>
                {isMock ? "Decision inspector (mock)" : "Jev decision inspector"}
              </button>
            </div>
            {bottomTab === "log" ? <EventLog entries={g.log} onInspect={inspectTurn} /> : <JevInspector record={g.lastTurn} mode={game.mode} />}
          </section>
        </div>

        <div className="right-col">
          {g.error && (
            <div className="error-box" role="alert">
              <strong>{g.error.code === "jev_budget_exhausted" ? "Budget exhausted" : game.status === "turn_failed" ? "Turn paused" : "Problem"}:</strong> {g.error.message}
              <div className="confirm-row">
                {game.status === "turn_failed" && game.pending && g.error.code !== "jev_budget_exhausted" && (
                  <button type="button" className="btn btn-primary" onClick={() => void g.retry()} disabled={g.busy}>Retry</button>
                )}
                <Link className="btn" href="/">Return to menu</Link>
                {game.status !== "turn_failed" && <button type="button" className="btn btn-sm" onClick={g.clearError}>Dismiss</button>}
              </div>
              <p className="small" style={{ marginTop: 6 }}>No turn was simulated. The environmental choice, map area, and candidates stay frozen until retry.</p>
            </div>
          )}
          {!g.error && game.status === "turn_failed" && game.pending && (
            <div className="error-box" role="alert">
              {game.pending.errorMessage ?? "The last turn failed."}
              <div className="confirm-row">
                <button type="button" className="btn btn-primary" onClick={() => void g.retry()} disabled={g.busy}>Retry</button>
                <Link className="btn" href="/">Return to menu</Link>
              </div>
            </div>
          )}
          {!review && lastEntry?.summary && (
            <section className="panel panel-pad last-turn" aria-label="What happened last turn">
              <h3>Last turn ({lastEntry.turn}): {lastEntry.eventTitle}: {lastEntry.optionLabel}</h3>
              <TurnStory entry={lastEntry} />
            </section>
          )}
          {review && (
            <NatureReview
              key={`review-${review.event.turn}`}
              review={review}
              mode={game.mode}
              status={status}
              deciding={deciding}
              finished={finished}
              onProceed={g.proceed}
            />
          )}
          {!review && !finished && game.event && (
            <EventPanel
              key={game.event.turn}
              event={game.event}
              mode={game.mode}
              busy={g.busy}
              deciding={deciding}
              locked={deciding || game.status === "turn_failed"}
              status={status}
              onConfirm={(id) => void g.submit(id)}
            />
          )}
          {allGone && !finished && (
            <div className="notice-box">No tribe survives. Environment-only turns continue with the same odd/even rules; no model requests are made.</div>
          )}
          {game.activeEffects.length > 0 && (
            <section className="panel panel-pad" aria-label="Active environmental effects">
              <h3>Active effects</h3>
              <ul className="plain-list small">
                {game.activeEffects.map((e) => <li key={e.id}>{e.description} <span className="muted">({e.remaining} turn{e.remaining > 1 ? "s" : ""} left)</span></li>)}
              </ul>
              {game.queuedEffects.length > 0 && (
                <p className="small muted">Coming: {game.queuedEffects.map((q) => `${q.label} (turn ${q.activateTurn})`).join("; ")}</p>
              )}
            </section>
          )}
          <Scoreboard tribes={game.tribes} supported={game.supportedTribeId} selected={selectedTribeId} onSelect={setSelectedTribe} />
          {selTribe && <TribeDetail tribe={selTribe} supported={selTribe.id === game.supportedTribeId} onFocus={() => mapRef.current?.focusTile(selTribe.settlement)} currentTurn={cal.turn} />}
          <p className="small muted">
            Seed <span className="mono">{game.seed}</span> · {game.rulesVersion} · {game.contentVersion}
            {game.usedFallbackMap ? " · fallback map" : ""} · generation attempt {game.generationAttempt}
            {game.mode === "live" ? ` · Jev attempts ${game.attemptsUsed}/${game.maxAttempts}` : ""}
          </p>
        </div>
      </div>

      {!onboarded && <Onboarding onClose={closeOnboarding} mode={game.mode} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {confirmAbandon && (
        <div className="overlay">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="abandon-title">
            <h2 id="abandon-title">End this match?</h2>
            <p>The match will be marked abandoned at turn {game.completedTurn}. The remaining turns will not be simulated and no final ranking will be claimed.</p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmAbandon(false)} autoFocus>Keep playing</button>
              <button type="button" className="btn btn-danger" onClick={() => { setConfirmAbandon(false); void g.abandon(); }}>End match</button>
            </div>
          </div>
        </div>
      )}
      {showElimination && (
        <div className="overlay">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="elim-title">
            <h2 id="elim-title">{TRIBES[game.supportedTribeId].name} {supported ? fateText(supported) : "has disappeared"}</h2>
            <p>
              {supported?.fate === "joined"
                ? "Its people now live on as part of another tribe. "
                : supported?.fate === "conquered"
                  ? "Its survivors were taken in by the conquerors. "
                  : "Its settlements are now ruins. "}
              You can keep watching the other tribes through turn {game.totalTurns}, or end viewing now. Ending marks the match abandoned; the remaining turns are not simulated.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDismissedElimination(true)} autoFocus>Continue watching</button>
              <button type="button" className="btn" onClick={() => { setDismissedElimination(true); void g.abandon(); }}>End viewing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

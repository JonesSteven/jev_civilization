"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TRIBES } from "@/content/tribes";
import { TRIBE_IDS, type TribeId } from "@/lib/game/types";
import { api, ClientApiError } from "@/lib/client/api";
import HelpDialog from "./HelpDialog";

type Config = { liveAvailable: boolean; mockPermitted: boolean; model: string };
type GameSummary = Awaited<ReturnType<typeof api.listGames>>[number];

export default function StartScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [tribe, setTribe] = useState<TribeId | null>(null);
  const [seed, setSeed] = useState("");
  const [mode, setMode] = useState<"live" | "mock">("live");
  const [totalTurns, setTotalTurns] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    api.config().then((c) => {
      setConfig(c);
      if (!c.liveAvailable && c.mockPermitted) setMode("mock");
    }).catch(() => setError("Could not reach the game server."));
    api.listGames().then(setGames).catch(() => undefined);
  }, []);

  const start = async () => {
    if (!tribe) return;
    setBusy(true);
    setError(null);
    try {
      const g = await api.createGame({ tribeId: tribe, mode, totalTurns, ...(seed.trim() ? { seed: seed.trim() } : {}) });
      router.push(`/game/${g.id}`);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not start the match.");
      setBusy(false);
    }
  };

  const liveBlocked = mode === "live" && config !== null && !config.liveAvailable;

  return (
    <main className="start">
      <div className="start-hero">
        <div>
          <h1>Jev Civilizations</h1>
          <p>
            Four tribes decide for themselves. You support one of them, but you cannot give orders: on odd turns you choose how the
            environment changes, and on even turns Nature chooses. Every turn, Jev decides what each surviving tribe does, and the game
            engine works out what happens. When the match ends, the highest civilization score wins.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setHelp(true)}>How it works</button>
      </div>

      <h2 id="choose-tribe">Choose the tribe you will support</h2>
      <p className="muted">The map and starting locations are revealed after you commit. Your choice never changes the world, the random events, or what Jev is told.</p>
      <div className="tribe-grid" role="group" aria-labelledby="choose-tribe">
        {TRIBE_IDS.map((id) => {
          const t = TRIBES[id];
          return (
            <button key={id} type="button" className="panel tribe-card" aria-pressed={tribe === id} onClick={() => setTribe(id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="illus" src={t.illustration} alt="" />
              <div className="body">
                <h3>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="emblem" src={t.symbol} alt="" /> {t.name}
                </h3>
                <span className="difficulty">Difficulty: {t.difficulty}</span>
                <span>{t.description}</span>
                <div>
                  <div className="section-title">Advantages</div>
                  <ul>{t.advantages.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
                <div>
                  <div className="section-title">Vulnerabilities</div>
                  <ul>{t.vulnerabilities.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="start-controls">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <fieldset>
            <legend>Decision mode</legend>
            <div className="radio-row">
              <label>
                <input type="radio" name="mode" value="live" checked={mode === "live"} onChange={() => setMode("live")} />
                Live Jev ({config?.model ?? "…"})
              </label>
              {config?.mockPermitted && (
                <label>
                  <input type="radio" name="mode" value="mock" checked={mode === "mock"} onChange={() => setMode("mock")} />
                  <span className="chip badge-mock">Mock simulation</span> local test policy, not Jev
                </label>
              )}
            </div>
            {liveBlocked && (
              <div className="notice-box" style={{ marginTop: 8 }} role="status">
                Live play needs <code>TYPESAFE_API_KEY</code> set on the server (in <code>.env.local</code>), then a server restart.
                {config?.mockPermitted ? " You can still start a clearly labeled mock simulation." : ""}
              </div>
            )}
          </fieldset>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <strong>Match length</strong>
            <select value={totalTurns} onChange={(e) => setTotalTurns(Number(e.target.value))} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line-2)" }}>
              {[10, 20, 30, 50, 75, 100, 150, 200].map((n) => (
                <option key={n} value={n}>{n} turns{n === 50 ? " (default)" : ""}</option>
              ))}
            </select>
            <span className="small muted">{totalTurns / 8} years of two seasons-turns each</span>
          </label>
          <details>
            <summary>Advanced: world seed</summary>
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              Seed
              <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={64} placeholder="random" style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line-2)" }} />
            </label>
            <p className="small muted">The same seed creates the same world for every tribe choice. Jev&apos;s live decisions can still differ between runs.</p>
          </details>
          {error && <div className="error-box" role="alert">{error}</div>}
        </div>
        <button type="button" className="btn btn-primary" style={{ fontSize: 16, padding: "10px 18px" }} disabled={!tribe || busy || liveBlocked} onClick={start}>
          {busy ? "Generating world…" : tribe ? `Support ${TRIBES[tribe].name}` : "Choose a tribe"}
        </button>
      </div>

      {games.length > 0 && (
        <section className="games-list panel panel-pad" aria-label="Your matches">
          <h2>Your matches</h2>
          <table>
            <thead>
              <tr><th>Supporting</th><th>Mode</th><th>Turn</th><th>Status</th><th>Seed</th><th></th></tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>{TRIBES[g.supportedTribeId as TribeId]?.name ?? g.supportedTribeId}</td>
                  <td><span className={`chip ${g.mode === "mock" ? "badge-mock" : "badge-live"}`}>{g.mode === "mock" ? "Mock" : "Live"}</span></td>
                  <td className="num">{g.completedTurn}/{g.totalTurns}</td>
                  <td>{g.status.replace("_", " ")}</td>
                  <td className="mono">{g.seed}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <Link className="btn btn-sm" href={`/game/${g.id}`}>{g.status === "finished" || g.status === "abandoned" ? "View" : "Resume"}</Link>
                    {g.completedTurn > 0 && <Link className="btn btn-sm" href={`/game/${g.id}/replay`}>Replay</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TRIBES } from "@/content/tribes";
import type { GameOutcome, TribeId } from "@/lib/game/types";
import type { MapAnimation } from "@/components/MapCanvas";
import { api, ClientApiError, idempotencyKeyFor } from "./api";
import type { GameView, ReplayData, TurnRecord } from "./types";
import { usePref, useMediaQuery } from "./prefs";
import { decodeWorld, type DecodedWorld } from "./world";

export interface LogEntry {
  turn: number;
  source: string;
  eventTitle: string;
  optionLabel: string;
  footprintLabel: string;
  decisions: { tribeId: TribeId; kind: string; selected: string; probability: number | null }[];
  outcomes: GameOutcome[];
}

export interface UiError {
  code: string;
  message: string;
}

export type Speed = "normal" | "fast";

export function logFromRecord(r: TurnRecord): LogEntry {
  return {
    turn: r.turn,
    source: r.source,
    eventTitle: r.eventTitle,
    optionLabel: r.optionLabel,
    footprintLabel: r.footprintLabel,
    decisions: r.decisions.map((d) => ({
      tribeId: d.tribeId,
      kind: d.offered.find((o) => o.id === d.selected)?.kind ?? "",
      selected: d.selected,
      probability: d.probabilities[d.selected] ?? null,
    })),
    outcomes: r.outcomes,
  };
}

export function logFromReplay(r: ReplayData["turns"][number]): LogEntry {
  return {
    turn: r.turn,
    source: r.source,
    eventTitle: r.eventTitle,
    optionLabel: r.optionLabel,
    footprintLabel: r.footprintLabel,
    decisions: r.decisions.map((d) => ({ tribeId: d.tribeId as TribeId, kind: d.kind, selected: d.selected, probability: d.selectedProbability })),
    outcomes: r.outcomes,
  };
}

/** Map measured outcomes to lightweight map animations. Cosmetic only; never alters simulation. */
export function animationsFor(outcomes: GameOutcome[], footprint: number[] | null | undefined): MapAnimation[] {
  const items: MapAnimation[] = [];
  if (footprint !== undefined) items.push({ kind: "flash", tiles: footprint });
  for (const o of outcomes) {
    const color = o.tribeId ? TRIBES[o.tribeId].colorDark : "#555";
    if (o.kind === "relocate" && o.path && o.path.length > 1) items.push({ kind: "path", path: o.path, color, style: "move" });
    else if (o.kind === "raid" && o.path && o.path.length > 1) items.push({ kind: "path", path: o.path, color, style: "raid", success: o.success });
    else if (o.kind === "recruit" && o.success && o.from !== undefined && o.to !== undefined) items.push({ kind: "path", path: [o.from, o.to], color, style: "recruit" });
    else if (o.tiles && o.tiles.length && ["establish_site", "build_housing", "build_defenses", "expand", "eliminated"].includes(o.kind)) items.push({ kind: "pulse", tiles: o.tiles, color });
  }
  return items;
}

export function useGame(gameId: string) {
  const [game, setGame] = useState<GameView | null>(null);
  const [world, setWorld] = useState<DecodedWorld | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastTurn, setLastTurn] = useState<TurnRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paused, setPaused] = usePref("jc-paused", false);
  const [speed, setSpeed] = usePref<Speed>("jc-speed", "normal");
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [reducedPref, setReducedMotion] = usePref<boolean | null>("jc-reduced-motion", null);
  const reducedMotion = reducedPref ?? systemReduced;
  const [animations, setAnimations] = useState<{ id: number; items: MapAnimation[]; durationMs: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const animId = useRef(0);
  const inflight = useRef(false);

  const applyGame = useCallback((g: GameView) => {
    setGame(g);
    setWorld(decodeWorld(g.world));
  }, []);

  const load = useCallback(
    () =>
      Promise.all([api.getGame(gameId), api.replay(gameId, false)]).then(
        ([g, replay]) => {
          applyGame(g);
          setLog(replay.turns.map(logFromReplay).reverse());
          if (g.completedTurn > 0) api.getTurn(gameId, g.completedTurn).then(setLastTurn).catch(() => undefined);
          if (g.status === "turn_failed" && g.pending) setError({ code: g.pending.errorCode ?? "turn_failed", message: g.pending.errorMessage ?? "The last turn failed." });
        },
        (e: unknown) => setLoadError(e instanceof ClientApiError ? e.message : "Could not load this game."),
      ),
    [gameId, applyGame],
  );

  useEffect(() => {
    // State is set only in the promise callbacks inside load().
    const p = load();
    return () => void p;
  }, [load]);

  const finishTurn = useCallback(
    (g: GameView, record: TurnRecord) => {
      applyGame(g);
      setLastTurn(record);
      setLog((prev) => [logFromRecord(record), ...prev.filter((e) => e.turn !== record.turn)]);
      const items = animationsFor(record.outcomes, record.footprint);
      const durationMs = speed === "fast" ? 700 : 1800;
      if (!reducedMotion && items.length) {
        setAnimating(true);
        setAnimations({ id: ++animId.current, items, durationMs });
        window.setTimeout(() => setAnimating(false), durationMs + 200);
      } else {
        setAnimations({ id: ++animId.current, items: [], durationMs: 0 });
      }
    },
    [applyGame, speed, reducedMotion],
  );

  const handleResult = useCallback(
    (status: number, data: { game: GameView; turn?: TurnRecord; pending?: boolean }) => {
      if (status === 200 && data.turn) finishTurn(data.game, data.turn);
      else applyGame(data.game);
    },
    [finishTurn, applyGame],
  );

  const submit = useCallback(
    async (optionId?: string) => {
      if (!game || !game.event || inflight.current) return;
      inflight.current = true;
      setBusy(true);
      setError(null);
      const turn = game.completedTurn + 1;
      try {
        const res = await api.submitTurn(gameId, {
          expectedVersion: game.version,
          expectedTurn: turn,
          eventId: game.event.eventId,
          idempotencyKey: idempotencyKeyFor(gameId, turn, optionId),
          ...(optionId ? { optionId } : {}),
        });
        handleResult(res.status, res.data);
      } catch (e) {
        if (e instanceof ClientApiError) {
          if (e.game) applyGame(e.game);
          setError({ code: e.body.code, message: e.body.message });
          if (e.body.code === "stale_version" || e.body.code === "turn_in_progress" || e.body.code === "turn_already_completed") void load();
        } else setError({ code: "network", message: "Network error while submitting the turn. Your choice is saved; reload or retry." });
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [game, gameId, handleResult, applyGame, load],
  );

  const retry = useCallback(async () => {
    if (!game?.pending || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.retryTurn(gameId, game.pending.turn, { expectedVersion: game.version, idempotencyKey: game.pending.idempotencyKey });
      handleResult(res.status, res.data);
    } catch (e) {
      if (e instanceof ClientApiError) {
        if (e.game) applyGame(e.game);
        setError({ code: e.body.code, message: e.body.message });
      } else setError({ code: "network", message: "Network error while retrying." });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [game, gameId, handleResult, applyGame]);

  // Poll while another request (or a previous page load) is deciding this turn.
  useEffect(() => {
    if (!game || busy) return;
    if (game.status !== "deciding" && game.status !== "resolving") return;
    const t = window.setTimeout(async () => {
      try {
        const g = await api.getGame(gameId);
        if (g.completedTurn > game.completedTurn) {
          const rec = await api.getTurn(gameId, g.completedTurn);
          finishTurn(g, rec);
        } else applyGame(g);
        if (g.status === "turn_failed" && g.pending) setError({ code: g.pending.errorCode ?? "turn_failed", message: g.pending.errorMessage ?? "The turn failed." });
      } catch {
        // keep polling
      }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [game, busy, gameId, applyGame, finishTurn]);

  // Nature turns run automatically unless paused. The option is frozen server-side; pausing only delays it.
  useEffect(() => {
    if (!game || busy || animating || paused || error) return;
    if (game.status !== "nature_pending" || !game.event) return;
    const delay = speed === "fast" ? 500 : 1400;
    const t = window.setTimeout(() => void submit(), delay);
    return () => window.clearTimeout(t);
  }, [game, busy, animating, paused, error, speed, submit]);

  const abandon = useCallback(async () => {
    if (!game) return;
    try {
      applyGame(await api.abandon(gameId, game.version));
    } catch (e) {
      setError({ code: e instanceof ClientApiError ? e.body.code : "network", message: e instanceof ClientApiError ? e.message : "Could not end viewing." });
    }
  }, [game, gameId, applyGame]);

  const selectTurnTrace = useCallback(async (turn: number) => {
    try {
      setLastTurn(await api.getTurn(gameId, turn));
    } catch {
      // ignore
    }
  }, [gameId]);

  const settlements = useMemo(() => (game ? game.tribes.map((t) => ({ id: t.id, tile: t.settlement, alive: t.alive, camp: t.camp && t.camp.capacity > 0 ? t.camp.condition : null })) : []), [game]);

  return {
    game,
    world,
    log,
    lastTurn,
    busy,
    error,
    loadError,
    paused,
    setPaused,
    speed,
    setSpeed,
    reducedMotion,
    setReducedMotion,
    animations,
    animating,
    submit,
    retry,
    abandon,
    selectTurnTrace,
    settlements,
    clearError: () => setError(null),
  };
}

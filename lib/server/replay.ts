import "server-only";
// Recorded replay and export. Replays apply recorded data only: they never call Jev or any network service.

import { deserializeState, hashState, type SerializedGameState, type WorldView, type WorldViewDelta } from "@/lib/game/serialize";
import { resolveTurn } from "@/lib/game/turn";
import type { TribeId } from "@/lib/game/types";
import { getDb, unpackJson } from "./db";
import { metaOf, type GameRow } from "./games";
import type { TribePanel } from "./present";
import type { TurnRecord } from "./turns";

export function recordedTurns(gameId: string): { record: TurnRecord; delta: WorldViewDelta }[] {
  const rows = getDb().prepare("SELECT record, delta FROM turns WHERE game_id = ? ORDER BY turn").all(gameId) as { record: Uint8Array; delta: Uint8Array }[];
  return rows.map((r) => ({ record: unpackJson<TurnRecord>(r.record), delta: unpackJson<WorldViewDelta>(r.delta) }));
}

export function replayData(row: GameRow) {
  const initial = unpackJson<{ world: WorldView; tribes: TribePanel[]; stateHash: string }>(
    (getDb().prepare("SELECT initial_view FROM games WHERE id = ?").get(row.id) as { initial_view: Uint8Array }).initial_view,
  );
  const turns = recordedTurns(row.id).map(({ record, delta }) => ({
    turn: record.turn,
    source: record.source,
    eventId: record.eventId,
    eventTitle: record.eventTitle,
    optionId: record.optionId,
    optionLabel: record.optionLabel,
    footprint: record.footprint,
    footprintLabel: record.footprintLabel,
    model: record.model,
    decisions: record.decisions.map((d) => ({
      tribeId: d.tribeId,
      selected: d.selected,
      confidence: d.confidence,
      selectedProbability: d.probabilities[d.selected] ?? null,
      label: d.offered.find((o) => o.id === d.selected)?.description ?? d.selected,
      kind: d.offered.find((o) => o.id === d.selected)?.kind ?? "",
    })),
    outcomes: record.outcomes,
    tribes: record.tribes,
    scores: record.scores,
    postStateHash: record.postStateHash,
    delta,
  }));
  return {
    label: "Replay",
    replayNote: "Recorded decisions and events. No model calls are made while replaying.",
    game: { ...metaOf(row), seed: row.seed, rulesVersion: row.rules_version, contentVersion: row.content_version, contentHash: row.content_hash, completedTurn: row.completed_turn },
    initial,
    turns,
  };
}

/**
 * Exact replay verification: re-run the engine from the recorded initial state with the recorded event
 * options and executed candidates, and compare every post-turn state hash. Makes no network calls.
 */
export function verifyReplay(gameId: string): { ok: boolean; turnsChecked: number; mismatches: number[] } {
  const k0 = getDb().prepare("SELECT state FROM keyframes WHERE game_id = ? AND turn = 0").get(gameId) as { state: Uint8Array } | undefined;
  if (!k0) return { ok: false, turnsChecked: 0, mismatches: [0] };
  let state = deserializeState(unpackJson<SerializedGameState>(k0.state));
  const mismatches: number[] = [];
  let checked = 0;
  for (const { record } of recordedTurns(gameId)) {
    if (hashState(state) !== record.preStateHash) mismatches.push(record.turn);
    const choices: Partial<Record<TribeId, string>> = {};
    for (const d of record.decisions) choices[d.tribeId] = d.selected;
    const res = resolveTurn(state, record.optionId, choices);
    state = res.state;
    if (hashState(state) !== record.postStateHash) mismatches.push(record.turn);
    checked++;
  }
  return { ok: mismatches.length === 0, turnsChecked: checked, mismatches: [...new Set(mismatches)] };
}

/** Export without secrets, cookies, session identifiers, database paths, or authorization metadata. */
export function exportGame(row: GameRow) {
  const turns = recordedTurns(row.id);
  return {
    format: "jev-civilizations-export",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    label: row.mode === "mock" ? "Mock simulation (not Jev)" : "Live Jev decisions",
    game: {
      id: row.id,
      mode: row.mode,
      status: row.status,
      supportedTribeId: row.supported_tribe,
      seed: row.seed,
      completedTurn: row.completed_turn,
      configuredModel: row.configured_model,
      rulesVersion: row.rules_version,
      contentVersion: row.content_version,
      contentHash: row.content_hash,
      attemptsUsed: row.attempts_used,
      usage: { inputTokens: row.usage_input_tokens, outputTokens: row.usage_output_tokens, attemptsWithUnknownUsage: row.usage_unknown_attempts },
    },
    note: "Jev requests below are the exact decision context sent (without the Authorization header). The supported tribe is recorded here for the player; it was never included in any Jev request.",
    turns: turns.map((t) => t.record),
  };
}

export function stateHashAt(row: GameRow): string {
  return hashState(deserializeState(unpackJson<SerializedGameState>(row.state)));
}

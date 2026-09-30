import { ACTION_GROUPS, ACTIONS } from "@/content/actions";
import { TRIBES } from "@/content/tribes";
import type { ActionKind, TribeFate, TribeId } from "@/lib/game/types";

/** "Working the land · Gather food": the plain group, then the specific action. */
export function plainAction(kind: string): { group: string; name: string } {
  const k = kind as ActionKind;
  return { group: ACTION_GROUPS[k] ?? kind.replace(/_/g, " "), name: ACTIONS[k]?.name ?? kind.replace(/_/g, " ") };
}

/** How a tribe left the game, in a few words ("joined Hearthwood on turn 86"). */
export function fateText(t: { fate: TribeFate | null; absorbedBy: TribeId | null; eliminatedTurn: number | null }): string {
  const when = t.eliminatedTurn !== null ? ` on turn ${t.eliminatedTurn}` : "";
  if (t.fate === "joined" && t.absorbedBy) return `joined ${TRIBES[t.absorbedBy].name}${when}`;
  if (t.fate === "conquered" && t.absorbedBy) return `conquered by ${TRIBES[t.absorbedBy].name}${when}`;
  return `wiped out${when}`;
}

/** Short chip label for a tribe that is gone. */
export function fateChip(t: { fate: TribeFate | null; absorbedBy: TribeId | null }): string {
  if (t.fate === "joined" && t.absorbedBy) return `joined ${TRIBES[t.absorbedBy].name}`;
  if (t.fate === "conquered" && t.absorbedBy) return "conquered";
  return "wiped out";
}

/** Outcome kinds that describe the whole turn (summary, weather, economy) rather than one tribe's action. */
const NOT_ACTIVITY = new Set([
  "environment",
  "delayed",
  "starvation",
  "exposure",
  "births",
  "epidemic",
  "raid_losses",
  "recruited_away",
  "shelter_damage",
  "settlement_stock",
  "growth",
  "eliminated",
]);

export interface TribeActivity {
  tribeId: TribeId;
  group: string;
  name: string;
  /** Sentences describing what the action did, including raids suffered from others. */
  lines: string[];
}

/** What each tribe did this turn: its chosen action in plain words plus the measured results of that action. */
export function groupActivity(entry: { decisions: { tribeId: TribeId; kind: string }[]; outcomes: { kind: string; tribeId: TribeId | null; target?: TribeId; text: string }[] }): TribeActivity[] {
  return entry.decisions.map((d) => {
    const a = plainAction(d.kind);
    const lines: string[] = [];
    for (const o of entry.outcomes) {
      if (o.tribeId === d.tribeId && !NOT_ACTIVITY.has(o.kind)) lines.push(o.text);
      else if (o.target === d.tribeId && o.kind === "raid") lines.push(`Attacked: ${o.text}`);
    }
    return { tribeId: d.tribeId, group: a.group, name: a.name, lines };
  });
}

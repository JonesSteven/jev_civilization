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

import { SEASONS, type ChoiceSource, type Season } from "./types";

/** Match length is chosen per game; the dramatic ruleset defaults to 100 so fortunes have time to diverge. */
export const DEFAULT_TOTAL_TURNS = 100;
export const MIN_TOTAL_TURNS = 10;
export const MAX_TOTAL_TURNS = 200;

export function choiceSource(turn: number): ChoiceSource {
  return turn % 2 === 1 ? "player" : "nature";
}

export function seasonIndex(turn: number): number {
  return Math.floor((turn - 1) / 2) % 4;
}

export function seasonOf(turn: number): Season {
  return SEASONS[seasonIndex(turn)] as Season;
}

export function yearOf(turn: number): number {
  return Math.floor((turn - 1) / 8) + 1;
}

/** "early" for the player's turn of the season, "late" for Nature's. */
export function seasonPhase(turn: number): "early" | "late" {
  return turn % 2 === 1 ? "early" : "late";
}

export function calendarOf(turn: number) {
  return { turn, season: seasonOf(turn), year: yearOf(turn), phase: seasonPhase(turn), source: choiceSource(turn) };
}

import { BALANCE } from "@/content/balance";
import { EVENTS, EVENT_BY_ID, type EventDef } from "@/content/events";
import { choiceSource, seasonOf } from "../calendar";
import { makeRng } from "../rng";
import { TERRAIN_NAMES, TILE_COUNT, type GameState, type PreparedEvent } from "../types";
import { livingTribes } from "../geo";
import { selectFootprint } from "./footprint";

function terrainCount(state: GameState, terrain: string): number {
  const code = TERRAIN_NAMES.indexOf(terrain as (typeof TERRAIN_NAMES)[number]);
  let n = 0;
  for (let i = 0; i < TILE_COUNT; i++) if (state.world.terrain[i] === code) n++;
  return n;
}

export function isEligible(state: GameState, event: EventDef, turn: number): boolean {
  const season = seasonOf(turn);
  if (event.seasons !== "any" && !event.seasons.includes(season)) return false;
  for (const p of event.preconditions) {
    if (p.kind === "terrainPresent" && terrainCount(state, p.terrain) < p.min) return false;
  }
  return true;
}

function shuffledIds(seed: string, refill: number): string[] {
  const ids = EVENTS.map((e) => e.id);
  return makeRng(seed, "events", "bag", refill).shuffle(ids);
}

/**
 * Prepare the event for `turn` from persisted state: shuffle-bag selection, footprint, and (on Nature
 * turns) the seeded option. Mutates the bag and recent-event list on `state`.
 */
export function prepareEvent(state: GameState, turn: number): PreparedEvent {
  const source = choiceSource(turn);
  const recent = new Set(
    state.recentEventIds.filter((r) => r.turn > turn - 1 - BALANCE.events.noRepeatWindow).map((r) => r.eventId),
  );
  const bag = state.eventBag;
  if (bag.order.length === 0) {
    bag.order = shuffledIds(state.seed, bag.refills);
    bag.refills++;
  }

  const findIn = (list: string[], allowRecent: boolean) =>
    list.find((id) => {
      const ev = EVENT_BY_ID[id];
      return ev !== undefined && isEligible(state, ev, turn) && (allowRecent || !recent.has(id));
    });

  let chosen = findIn(bag.order, false);
  if (!chosen) {
    // Refill deterministically: remaining entries stay at the front, a fresh shuffle follows.
    const fresh = shuffledIds(state.seed, bag.refills);
    bag.refills++;
    bag.order = [...bag.order, ...fresh.filter((id) => !bag.order.includes(id))];
    chosen = findIn(bag.order, false) ?? findIn(bag.order, true);
  }

  let eventId = chosen ?? BALANCE.events.fallbackEventId;
  const settlementTiles = livingTribes(state).flatMap((id) => [state.tribes[id].settlement, ...state.tribes[id].outposts]);
  bag.order = bag.order.filter((id) => id !== eventId);
  let fallback = false;
  let footprint = selectFootprint(state.world, (EVENT_BY_ID[eventId] as EventDef).footprint, state.seed, turn, eventId, settlementTiles);
  if (!footprint) {
    eventId = BALANCE.events.fallbackEventId;
    fallback = true;
    footprint = selectFootprint(state.world, (EVENT_BY_ID[eventId] as EventDef).footprint, state.seed, turn, eventId, settlementTiles);
  }
  if (!footprint) throw new Error("fallback event footprint unavailable");

  let natureOptionId: string | null = null;
  if (source === "nature") {
    const ev = EVENT_BY_ID[eventId] as EventDef;
    const idx = Math.floor(makeRng(state.seed, "nature", turn, eventId).next() * 3);
    natureOptionId = (ev.options[idx] ?? ev.options[0]).id;
  }

  state.recentEventIds = [...state.recentEventIds, { turn, eventId }].slice(-BALANCE.events.noRepeatWindow - 1);
  const prepared: PreparedEvent = {
    turn,
    eventId,
    source,
    footprint: footprint.tiles,
    footprintLabel: footprint.label,
    natureOptionId,
    fallback,
  };
  state.currentEvent = prepared;
  return prepared;
}

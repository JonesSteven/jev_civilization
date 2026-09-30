// Leaving the game: collapse, conquest, and unions. A tribe that collapses leaves ruins; a tribe that is
// conquered or joins another hands its people (in part), stores, land, buildings, settlements, and knowledge
// to the tribe that takes it in.

import { BALANCE } from "@/content/balance";
import { narrate } from "@/content/narration";
import { tribeName } from "@/content/tribes";
import { remember } from "./memory";
import { Overlay, TRIBE_IDS, type GameOutcome, type GameState, type TribeFate, type TribeId, type UnionOffer } from "./types";

/** Remove a tribe from play. With `into`, everything it holds passes to that tribe; otherwise it becomes ruins. */
function retire(state: GameState, id: TribeId, turn: number, fate: TribeFate, into: TribeId | null, changedTiles: Set<number>) {
  const t = state.tribes[id];
  const idx = TRIBE_IDS.indexOf(id);
  const intoIdx = into ? TRIBE_IDS.indexOf(into) : -1;
  const settlements = [t.settlement, ...t.outposts];
  for (const a of state.world.assets) {
    if (a.owner !== id) continue;
    a.owner = into;
    if (!into) state.world.overlay[a.tile] = (state.world.overlay[a.tile] as number) | Overlay.Ruin;
    changedTiles.add(a.tile);
  }
  for (let i = 0; i < state.world.owner.length; i++) {
    if (state.world.owner[i] !== idx) continue;
    state.world.owner[i] = intoIdx;
    changedTiles.add(i);
  }
  if (into) {
    const r = state.tribes[into];
    r.outposts = [...r.outposts, ...settlements.filter((x) => x !== r.settlement && !r.outposts.includes(x))];
    r.food += t.food;
    r.timber += t.timber;
    r.stone += t.stone;
    if (t.camp && t.camp.capacity > 0) {
      if (r.camp) {
        const total = r.camp.capacity + t.camp.capacity;
        r.camp.condition = Math.round((r.camp.capacity * r.camp.condition + t.camp.capacity * t.camp.condition) / total);
        r.camp.capacity = total;
      } else r.camp = { ...t.camp };
    }
    // Knowledge travels with people: the receiving tribe learns every technology the other knew.
    r.learned = [...r.learned, ...t.learned.filter((x) => !r.learned.includes(x))];
    if (r.project && r.learned.includes(r.project.techId)) r.project = null;
    r.militaryLevel = Math.max(r.militaryLevel, t.militaryLevel);
  } else {
    for (const tile of settlements) state.world.overlay[tile] = (state.world.overlay[tile] as number) | Overlay.Ruin;
  }
  t.alive = false;
  t.eliminatedTurn = turn;
  t.fate = fate;
  t.absorbedBy = into;
  t.population = 0;
  t.food = 0;
  t.timber = 0;
  t.stone = 0;
  t.project = null;
  t.camp = null;
  t.outposts = [];
  t.scoutedSites = [];
  state.unionOffers = (state.unionOffers ?? []).filter((o) => o.from !== id && o.to !== id);
}

/** A living tribe below the collapse threshold breaks apart. Returns true if it collapsed. */
export function collapseIfTooSmall(state: GameState, id: TribeId, turn: number, outcomes: GameOutcome[], changedTiles: Set<number>): boolean {
  const t = state.tribes[id];
  if (!t.alive || t.population >= BALANCE.population.collapseBelow) return false;
  const left = t.population;
  const tile = t.settlement;
  retire(state, id, turn, "collapsed", null, changedTiles);
  t.milestones.push({ turn, text: "Broke apart" });
  outcomes.push({
    kind: "eliminated",
    tribeId: id,
    text: left > 0 ? narrate("collapsed", { tribe: tribeName(id), count: left }) : narrate("eliminated", { tribe: tribeName(id) }),
    tiles: [tile],
    amounts: { population: -left },
  });
  return true;
}

/**
 * `from` becomes part of `into`: a share of its people join, and its stores, land, buildings, settlements,
 * and technologies pass over. `fate` records whether this was a conquest or an agreed union.
 */
export function absorbTribe(
  state: GameState,
  from: TribeId,
  into: TribeId,
  share: number,
  turn: number,
  fate: "conquered" | "joined",
  outcomes: GameOutcome[],
  changedTiles: Set<number>,
): number {
  const t = state.tribes[from];
  const r = state.tribes[into];
  const before = t.population;
  const joining = Math.floor(before * share);
  const tile = t.settlement;
  retire(state, from, turn, fate, into, changedTiles);
  r.population += joining;
  const a = tribeName(from),
    b = tribeName(into);
  if (fate === "joined") {
    t.milestones.push({ turn, text: `Joined ${b}` });
    r.milestones.push({ turn, text: `Welcomed ${a} into the tribe` });
    remember(state, into, turn, "union", `${a} joined us on turn ${turn}, bringing ${joining} people and all its land`);
    outcomes.push({ kind: "union", tribeId: from, text: narrate("union", { tribe: a, target: b, count: joining }), from: tile, to: r.settlement, amounts: { population: -before } });
    outcomes.push({ kind: "union_gain", tribeId: into, text: narrate("union_gain", { tribe: b, target: a, count: joining }), amounts: { population: joining } });
  } else {
    t.milestones.push({ turn, text: `Conquered by ${b}` });
    r.milestones.push({ turn, text: `Conquered ${a}` });
    remember(state, into, turn, "conquest", `Conquered ${a} on turn ${turn}; ${joining} survivors joined us`);
    outcomes.push({ kind: "conquered", tribeId: from, text: narrate("conquered", { tribe: a, target: b, count: joining }), from: r.settlement, to: tile, amounts: { population: -before } });
    outcomes.push({ kind: "conquest_gain", tribeId: into, text: narrate("conquest_gain", { tribe: b, target: a, count: joining }), amounts: { population: joining } });
  }
  return joining;
}

/** Population `lookback` turns ago (or the starting population if the history is shorter). */
function pastPopulation(state: GameState, id: TribeId, lookback: number): number {
  const t = state.tribes[id];
  const target = state.completedTurn - lookback;
  const h = [...t.history].reverse().find((p) => p.turn <= target);
  return h ? h.population : (t.history[0]?.population ?? t.population);
}

/** Has shrunk to at most `declineShare` of its size a few turns ago. */
export function isDeclining(state: GameState, id: TribeId): boolean {
  const t = state.tribes[id];
  if (!t.alive) return false;
  return t.population <= pastPopulation(state, id, BALANCE.union.declineLookback) * BALANCE.union.declineShare;
}

/** Why `offerer` could offer `target` a union right now, or null if it cannot. */
export function unionEligible(state: GameState, offerer: TribeId, target: TribeId): boolean {
  const U = BALANCE.union;
  const a = state.tribes[offerer];
  const b = state.tribes[target];
  if (offerer === target || !a.alive || !b.alive) return false;
  if (state.completedTurn + 1 < U.earliestTurn) return false;
  if (b.population < U.minPopulation) return false;
  if (a.population < b.population * U.sizeRatio) return false;
  if (a.food < b.population * U.foodPerJoiner) return false;
  // A neighbour that is overwhelmingly outgrown may seek protection even while it is holding steady.
  return isDeclining(state, target) || a.population >= b.population * U.overwhelmingRatio;
}

/** Offers to `id` that it may accept this turn: made on an earlier turn, still open, from a living tribe. */
export function acceptableOffers(state: GameState, id: TribeId, turn: number): UnionOffer[] {
  return (state.unionOffers ?? [])
    .filter((o) => o.to === id && o.turn < turn && turn - o.turn <= BALANCE.union.offerTurns && state.tribes[o.from].alive)
    .sort((x, y) => state.tribes[y.from].population - state.tribes[x.from].population || (x.from < y.from ? -1 : 1));
}

export function hasOpenOffer(state: GameState, from: TribeId, to: TribeId, turn: number): boolean {
  return (state.unionOffers ?? []).some((o) => o.from === from && o.to === to && turn - o.turn <= BALANCE.union.offerTurns);
}

/**
 * Diplomacy runs alongside each turn's action: every living tribe that qualifies to be taken in receives an offer
 * from the largest tribe able to make one (unless that tribe already has an open offer to it). The smaller tribe
 * decides whether to accept on a later turn.
 */
export function makeUnionOffers(state: GameState, turn: number, outcomes: GameOutcome[]) {
  const living = TRIBE_IDS.filter((id) => state.tribes[id].alive);
  for (const target of living) {
    const offerers = living
      .filter((o) => unionEligible(state, o, target))
      .sort((a, b) => state.tribes[b].population - state.tribes[a].population || (a < b ? -1 : 1));
    const from = offerers[0];
    if (!from || hasOpenOffer(state, from, target, turn)) continue;
    state.unionOffers = [...(state.unionOffers ?? []).filter((o) => !(o.from === from && o.to === target)), { from, to: target, turn }];
    remember(state, target, turn, "union_offer", `${tribeName(from)} offered on turn ${turn} to take in our people; we can accept for the next ${BALANCE.union.offerTurns} turns`);
    outcomes.push({ kind: "offer_union", tribeId: from, target, text: narrate("offer_union", { tribe: tribeName(from), target: tribeName(target) }) });
  }
}

/** Drop offers that can no longer be accepted after `turn`. */
export function expireOffers(state: GameState, turn: number) {
  state.unionOffers = (state.unionOffers ?? []).filter(
    (o) => turn + 1 - o.turn <= BALANCE.union.offerTurns && state.tribes[o.from].alive && state.tribes[o.to].alive,
  );
}

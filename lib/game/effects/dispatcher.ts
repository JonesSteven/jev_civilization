import { BALANCE } from "@/content/balance";
import { EVENT_BY_ID } from "@/content/events";
import { narrate } from "@/content/narration";
import { tribeName } from "@/content/tribes";
import { makeRng } from "../rng";
import { weatherDamageMultiplier } from "../shelter";
import {
  Overlay,
  TERRAIN_NAMES,
  TILE_COUNT,
  TRIBE_IDS,
  type ActiveEffect,
  type EffectOp,
  type GameOutcome,
  type GameState,
  type HousingTarget,
  type TileFilter,
  type TribeId,
} from "../types";
import { remember } from "../memory";
import { resetTileCapacities } from "../world/terrain";
import { nearWaterMask, passesFilter } from "./modifiers";

interface EffectMeta {
  eventId: string;
  optionId: string;
  label: string;
  footprint: number[] | null;
  turn: number;
  key: string; // stable key for seeded selection
}

const TEMPORARY = new Set(["yieldMult", "dryFarm", "travelMod", "regen", "exposure", "spoilage", "recurringShelterDamage"]);

function scopeTiles(op: { scope: string }, footprint: number[] | null): number[] {
  if (op.scope === "world" || footprint === null) return Array.from({ length: TILE_COUNT }, (_, i) => i);
  return footprint;
}

function filtered(state: GameState, op: EffectOp & TileFilter & { scope: string }, footprint: number[] | null, nearWater: Uint8Array): number[] {
  return scopeTiles(op, footprint).filter((t) => passesFilter(state.world, t, op, nearWater));
}

function inScope(op: { scope: string }, footprint: number[] | null, tile: number): boolean {
  return op.scope === "world" || footprint === null || footprint.includes(tile);
}

/** Apply shelter damage to housing in scope (and camps of tribes whose settlement is in scope). */
function damageShelters(
  state: GameState,
  op: { scope: string; amount: number; types?: HousingTarget[] } & TileFilter,
  footprint: number[] | null,
  nearWater: Uint8Array,
  outcomes: GameOutcome[],
  eventTitle: string,
) {
  const affected = new Set<string>();
  const types = op.types;
  for (const a of state.world.assets) {
    if (a.kind !== "housing" || !a.housingType || a.owner === null) continue;
    if (types && !types.includes(a.housingType)) continue;
    if (!inScope(op, footprint, a.tile) || !passesFilter(state.world, a.tile, op, nearWater)) continue;
    const loss = Math.round(op.amount * weatherDamageMultiplier(a.owner, a.housingType));
    if (loss <= 0) continue;
    a.condition = Math.max(0, (a.condition ?? 100) - loss);
    affected.add(a.owner);
  }
  if (!types || types.includes("camp")) {
    for (const id of TRIBE_IDS) {
      const t = state.tribes[id];
      if (!t.alive || !t.camp) continue;
      if (!inScope(op, footprint, t.settlement) || !passesFilter(state.world, t.settlement, op, nearWater)) continue;
      const mult = weatherDamageMultiplier(id, "camp");
      t.camp.condition = Math.max(0, t.camp.condition - Math.round(op.amount * mult));
      affected.add(id);
    }
  }
  for (const id of [...affected].sort()) {
    outcomes.push({ kind: "shelter_damage", tribeId: id as (typeof TRIBE_IDS)[number], text: narrate("shelterDamage", { tribe: tribeName(id as (typeof TRIBE_IDS)[number]), event: eventTitle.toLowerCase() }) });
  }
}

/** Living tribes whose claimed land touches `id`'s claimed land. */
function touchingTribes(state: GameState, id: TribeId): TribeId[] {
  const w = state.world;
  const me = TRIBE_IDS.indexOf(id);
  const found = new Set<number>();
  for (let t = 0; t < TILE_COUNT; t++) {
    if (w.owner[t] !== me) continue;
    const x = t % w.width;
    const around = [t - w.width, t + w.width, x > 0 ? t - 1 : -1, x < w.width - 1 ? t + 1 : -1];
    for (const n of around) {
      if (n < 0 || n >= TILE_COUNT) continue;
      const o = w.owner[n] as number;
      if (o >= 0 && o !== me) found.add(o);
    }
  }
  return TRIBE_IDS.filter((o, i) => found.has(i) && state.tribes[o].alive);
}

/**
 * Sickness strikes tribes with a settlement in the area, scaled by each tribe's resistance, then spreads at
 * reduced strength to living neighbours whose land touches a stricken tribe.
 */
function spreadEpidemic(state: GameState, fraction: number, struck: (id: TribeId) => boolean, turn: number, outcomes: GameOutcome[]) {
  const P = BALANCE.population;
  const direct = TRIBE_IDS.filter((id) => state.tribes[id].alive && struck(id));
  const indirect = new Set<TribeId>();
  for (const id of direct) for (const n of touchingTribes(state, id)) if (!direct.includes(n)) indirect.add(n);
  const hit = (id: TribeId, share: number, key: "epidemic" | "epidemic_spread") => {
    const t = state.tribes[id];
    const deaths = Math.min(t.population, Math.round(t.population * share * BALANCE.diseaseResistance[id]));
    if (deaths <= 0) return;
    t.population -= deaths;
    remember(state, id, turn, "sickness", `Sickness killed ${deaths} people on turn ${turn}`);
    outcomes.push({ kind: "epidemic", tribeId: id, text: narrate(key, { tribe: tribeName(id), count: deaths }), amounts: { population: -deaths } });
  };
  for (const id of direct) hit(id, fraction, "epidemic");
  for (const id of TRIBE_IDS) if (indirect.has(id)) hit(id, fraction * P.epidemicSpreadShare, "epidemic_spread");
}

function applyOneTime(state: GameState, op: EffectOp, meta: EffectMeta, outcomes: GameOutcome[], nearWater: Uint8Array, changedTiles: Set<number>) {
  const world = state.world;
  const eventTitle = EVENT_BY_ID[meta.eventId]?.title ?? meta.eventId;
  switch (op.op) {
    case "stockAdjust": {
      const stock = world.stock[op.resource];
      const cap = world.cap[op.resource];
      for (const t of filtered(state, op, meta.footprint, nearWater)) {
        if (op.fraction >= 0) {
          stock[t] = Math.min(cap[t] as number, (stock[t] as number) + op.fraction * (cap[t] as number));
        } else {
          const f = Math.min(-op.fraction, BALANCE.effects.maxDestructionFraction);
          stock[t] = Math.max(0, (stock[t] as number) * (1 - f));
        }
        changedTiles.add(t);
      }
      break;
    }
    case "capacityAdjust": {
      const stock = world.stock[op.resource];
      const cap = world.cap[op.resource];
      const f = op.fraction < 0 ? Math.max(op.fraction, -BALANCE.effects.maxDestructionFraction) : op.fraction;
      for (const t of filtered(state, op, meta.footprint, nearWater)) {
        cap[t] = Math.max(0, (cap[t] as number) * (1 + f));
        if ((stock[t] as number) > (cap[t] as number)) stock[t] = cap[t] as number;
        changedTiles.add(t);
      }
      break;
    }
    case "fertility": {
      for (const t of filtered(state, op, meta.footprint, nearWater)) {
        const v = (world.fertility[t] as number) + op.delta;
        world.fertility[t] = Math.max(0, Math.min(BALANCE.resources.fertility.max, v));
        changedTiles.add(t);
      }
      break;
    }
    case "convertTile": {
      const from = TERRAIN_NAMES.indexOf(op.from);
      const to = TERRAIN_NAMES.indexOf(op.to);
      const settlements = new Set(TRIBE_IDS.map((id) => state.tribes[id].settlement));
      // Existing buildings and settlements keep their base terrain.
      const eligible = scopeTiles(op, meta.footprint).filter(
        (t) => world.terrain[t] === from && world.assetAt[t] === -1 && !settlements.has(t),
      );
      const fraction = Math.min(op.fraction, BALANCE.effects.maxDestructionFraction);
      const n = Math.floor(eligible.length * fraction);
      const picked = makeRng(state.seed, "effects", meta.key, "convert").shuffle([...eligible]).slice(0, n);
      for (const t of picked) {
        world.terrain[t] = to;
        resetTileCapacities(world, t);
        world.overlay[t] = (world.overlay[t] as number) & ~Overlay.Burned;
        changedTiles.add(t);
      }
      break;
    }
    case "overlay": {
      const flag = Overlay[op.flag];
      const eligible = filtered(state, op, meta.footprint, nearWater).filter((t) => !((world.overlay[t] as number) & flag));
      const n = Math.max(eligible.length > 0 ? 1 : 0, Math.floor(eligible.length * Math.min(op.fraction, BALANCE.effects.maxOverlayFraction)));
      const picked = makeRng(state.seed, "effects", meta.key, "overlay").shuffle([...eligible]).slice(0, n).sort((a, b) => a - b);
      for (const t of picked) {
        world.overlay[t] = (world.overlay[t] as number) | flag;
        changedTiles.add(t);
      }
      return picked;
    }
    case "settlementStock": {
      for (const id of TRIBE_IDS) {
        const t = state.tribes[id];
        if (!t.alive || !inScope(op, meta.footprint, t.settlement) || !passesFilter(world, t.settlement, op, nearWater)) continue;
        t[op.resource] += op.amount;
        outcomes.push({
          kind: "settlement_stock",
          tribeId: id,
          text: narrate("settlementStock", { tribe: tribeName(id), amount: op.amount, resource: op.resource, event: eventTitle.toLowerCase() }),
          amounts: { [op.resource]: op.amount },
        });
      }
      break;
    }
    case "shelterDamage":
      damageShelters(state, op, meta.footprint, nearWater, outcomes, eventTitle);
      break;
    case "epidemic":
      spreadEpidemic(state, op.fraction, (id) => [state.tribes[id].settlement, ...state.tribes[id].outposts].some((x) => inScope(op, meta.footprint, x)), meta.turn, outcomes);
      break;
    default:
      break;
  }
  return undefined;
}

function activateOps(state: GameState, ops: EffectOp[], meta: EffectMeta, outcomes: GameOutcome[], changedTiles: Set<number>) {
  const nearWater = nearWaterMask(state.world);
  ops.forEach((op, i) => {
    const key = `${meta.key}:${i}`;
    if (op.op === "delayed") {
      state.queuedEffects.push({
        id: `q${++state.effectCounter}`,
        sourceEventId: meta.eventId,
        sourceOptionId: meta.optionId,
        label: op.label,
        activateTurn: meta.turn + op.afterTurns,
        effects: op.effects,
        footprint: meta.footprint,
      });
      return;
    }
    const duration = "duration" in op && typeof op.duration === "number" ? Math.min(op.duration, BALANCE.effects.maxDuration) : 0;
    if (TEMPORARY.has(op.op)) {
      state.activeEffects.push({
        id: `e${++state.effectCounter}`,
        sourceEventId: meta.eventId,
        sourceOptionId: meta.optionId,
        label: meta.label,
        op,
        footprint: meta.footprint,
        activatedTurn: meta.turn,
        remaining: Math.max(1, duration),
      });
      return;
    }
    const flagged = applyOneTime(state, op, { ...meta, key }, outcomes, nearWater, changedTiles);
    if (op.op === "overlay" && duration > 0 && flagged) {
      // Temporary visual overlay (e.g. floods, burns): cleared when it expires.
      state.activeEffects.push({
        id: `e${++state.effectCounter}`,
        sourceEventId: meta.eventId,
        sourceOptionId: meta.optionId,
        label: meta.label,
        op,
        footprint: meta.footprint,
        activatedTurn: meta.turn,
        remaining: duration,
        flaggedTiles: flagged,
      });
    }
  });
}

/** Step 7: activate the announced option and any queued delayed effects due this turn. */
export function activateEnvironment(
  state: GameState,
  eventId: string,
  optionId: string,
  footprint: number[] | null,
  turn: number,
  outcomes: GameOutcome[],
  changedTiles: Set<number>,
) {
  const event = EVENT_BY_ID[eventId];
  const option = event?.options.find((o) => o.id === optionId);
  if (!event || !option) throw new Error(`unknown event option ${eventId}/${optionId}`);
  outcomes.push({
    kind: "environment",
    tribeId: null,
    text: narrate("environment", { event: event.title, option: option.label, summary: option.description }),
    tiles: footprint ?? undefined,
  });
  activateOps(state, option.effects, { eventId, optionId, label: `${event.title}: ${option.label}`, footprint, turn, key: `${turn}:${eventId}:${optionId}` }, outcomes, changedTiles);

  const due = state.queuedEffects.filter((q) => q.activateTurn === turn);
  state.queuedEffects = state.queuedEffects.filter((q) => q.activateTurn !== turn);
  for (const q of due) {
    outcomes.push({ kind: "delayed", tribeId: null, text: narrate("delayed", { label: q.label }), tiles: q.footprint ?? undefined });
    activateOps(state, q.effects, { eventId: q.sourceEventId, optionId: q.sourceOptionId, label: q.label, footprint: q.footprint, turn, key: `${turn}:${q.id}` }, outcomes, changedTiles);
  }
}

/** Recurring damage fires on every turn of its duration, including activation. */
export function applyRecurring(state: GameState, outcomes: GameOutcome[]) {
  const nearWater = nearWaterMask(state.world);
  for (const e of state.activeEffects) {
    if (e.op.op !== "recurringShelterDamage") continue;
    const title = EVENT_BY_ID[e.sourceEventId]?.title ?? e.label;
    damageShelters(state, e.op, e.footprint, nearWater, outcomes, title);
  }
}

/** Decrement durations after the economy; expired effects are removed before the next snapshot. */
export function expireEffects(state: GameState, changedTiles: Set<number>) {
  const keep: ActiveEffect[] = [];
  for (const e of state.activeEffects) {
    e.remaining -= 1;
    if (e.remaining > 0) {
      keep.push(e);
      continue;
    }
    if (e.op.op === "overlay" && e.flaggedTiles) {
      const flag = Overlay[e.op.flag];
      for (const t of e.flaggedTiles) {
        state.world.overlay[t] = (state.world.overlay[t] as number) & ~flag;
        changedTiles.add(t);
      }
    }
  }
  state.activeEffects = keep;
}

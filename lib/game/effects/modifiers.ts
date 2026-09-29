import { BALANCE } from "@/content/balance";
import { Terrain, TERRAIN_NAMES, TILE_COUNT, type ActiveEffect, type EffectOp, type GameState, type Season, type TileFilter, type TileResource, type TribeId, type WorldState, type YieldChannel } from "../types";
import { tilesWithin } from "../world/grid";

/** Distance-to-water ≤ 2 mask for land tiles; water tiles are marked too. Water is never created, so this is stable. */
export function nearWaterMask(world: WorldState): Uint8Array {
  const mask = new Uint8Array(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    if (world.terrain[i] !== Terrain.Water) continue;
    for (const t of tilesWithin(i, 2)) mask[t] = 1;
  }
  return mask;
}

export function passesFilter(world: WorldState, tile: number, filter: TileFilter, nearWater: Uint8Array): boolean {
  if (filter.terrain && !filter.terrain.includes(TERRAIN_NAMES[world.terrain[tile] as number] as (typeof TERRAIN_NAMES)[number])) return false;
  if (filter.nearWater && !nearWater[tile]) return false;
  return true;
}

/**
 * Per-turn index over active effects. Footprint masks are built once, so tile lookups are cheap.
 * Stacking rule: multiplicative within a channel, then clamped to the modifier bounds (0.25–2.0).
 */
export class ModifierIndex {
  private masks = new Map<string, Uint8Array>();
  readonly nearWater: Uint8Array;

  constructor(
    private readonly state: GameState,
    private readonly effects: ActiveEffect[],
  ) {
    this.nearWater = nearWaterMask(state.world);
  }

  private covers(effect: ActiveEffect, tile: number): boolean {
    const op = effect.op as EffectOp & { scope: string };
    if (op.scope === "world" || effect.footprint === null) return true;
    let mask = this.masks.get(effect.id);
    if (!mask) {
      mask = new Uint8Array(TILE_COUNT);
      for (const t of effect.footprint) mask[t] = 1;
      this.masks.set(effect.id, mask);
    }
    return mask[tile] === 1;
  }

  private matches(effect: ActiveEffect, tile: number): boolean {
    if (!this.covers(effect, tile)) return false;
    const op = effect.op as TileFilter;
    return passesFilter(this.state.world, tile, op, this.nearWater);
  }

  /** Environmental yield multiplier for a channel at a tile (site tile, or settlement for tribe-level channels). */
  yieldMultiplier(channel: YieldChannel, tile: number, irrigation: boolean): number {
    let mult = 1;
    let dry = 1;
    for (const e of this.effects) {
      const op = e.op;
      if (op.op === "yieldMult" && op.channel === channel && this.matches(e, tile)) mult *= op.factor;
      if (channel === "farm" && op.op === "dryFarm" && this.matches(e, tile)) dry *= op.factor;
    }
    if (irrigation) dry = Math.max(dry, BALANCE.production.irrigationDryFloor);
    return clampMod(mult * dry);
  }

  regenMultiplier(resource: TileResource, tile: number): number {
    let mult = 1;
    for (const e of this.effects) {
      if (e.op.op === "regen" && e.op.resource === resource && this.matches(e, tile)) mult *= e.op.factor;
    }
    return clampMod(mult);
  }

  /** Additive exposure severity for a tribe whose settlement is at `tile`. */
  exposureAdd(tile: number): number {
    let add = 0;
    for (const e of this.effects) if (e.op.op === "exposure" && this.covers(e, tile)) add += e.op.add;
    return add;
  }

  spoilageAdd(tile: number): number {
    let add = 0;
    for (const e of this.effects) if (e.op.op === "spoilage" && this.covers(e, tile)) add += e.op.add;
    return add;
  }

  /** Summed travel delta per tile from active travel modifiers plus the winter penalty. */
  travelDelta(season: Season): Int8Array {
    const delta = new Int8Array(TILE_COUNT);
    if (season === "winter") {
      for (let i = 0; i < TILE_COUNT; i++) if (this.state.world.terrain[i] !== Terrain.Water) delta[i] = BALANCE.travel.winterPenalty;
    }
    for (const e of this.effects) {
      if (e.op.op !== "travelMod") continue;
      const tiles = e.footprint ?? null;
      if (tiles === null || e.op.scope === "world") {
        for (let i = 0; i < TILE_COUNT; i++) if (this.matches(e, i)) delta[i] = (delta[i] as number) + e.op.delta;
      } else {
        for (const t of tiles) if (this.matches(e, t)) delta[t] = (delta[t] as number) + e.op.delta;
      }
    }
    return delta;
  }

  activeFor(tribeTile: number): ActiveEffect[] {
    return this.effects.filter((e) => this.covers(e, tribeTile));
  }
}

export function clampMod(v: number): number {
  return Math.min(BALANCE.production.modifierMax, Math.max(BALANCE.production.modifierMin, v));
}

export function describeScope(effect: { footprint: number[] | null }, tribeTile: number): boolean {
  return effect.footprint === null || effect.footprint.includes(tribeTile);
}

export type { TribeId };

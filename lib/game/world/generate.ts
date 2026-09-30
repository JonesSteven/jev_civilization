import { BALANCE, RULES_VERSION, STARTING } from "@/content/balance";
import { TRIBES } from "@/content/tribes";
import { DEFAULT_TOTAL_TURNS, MAX_TOTAL_TURNS, MIN_TOTAL_TURNS } from "../calendar";
import { makeRng } from "../rng";
import { Terrain, TILE_COUNT, TRIBE_IDS, type GameState, type TribeId, type TribeState, type WorldState } from "../types";
import { tileId } from "./grid";
import { claimStartTerritory, lastAssetFailure, placeStartingAssets, territoryGapOk, trySettlementPlacement, validatePlacement, type Settlements } from "./placement";
import { createEmptyWorld, fillResources, generateTerrain } from "./terrain";

export const SCHEMA_VERSION = 1;

export interface GenerationResult {
  world: WorldState;
  settlements: Settlements;
  attempt: number;
  usedFallback: boolean;
}

/**
 * Deterministic world generation from (seed, rules/content versions). The supported tribe is never an input.
 * Bounded retries, then a committed fallback template transformed by the seed. Never loops indefinitely.
 */
export function generateWorld(seed: string): GenerationResult {
  for (let attempt = 0; attempt < BALANCE.map.maxGenerationAttempts; attempt++) {
    const world = createEmptyWorld();
    const { terrain, moisture } = generateTerrain(seed, attempt);
    world.terrain.set(terrain);
    fillResources(world, seed, attempt, moisture);
    let placedWorld: WorldState | null = null;
    // Each candidate placement is checked on a copy, so a nonviable start never mutates the base map.
    const settlements = trySettlementPlacement(world, seed, attempt, (candidate) => {
      const copy = structuredClone(world);
      const territory = claimStartTerritory(copy, candidate);
      if (!territoryGapOk(copy, territory)) return false;
      if (!placeStartingAssets(copy, candidate, territory)) return false;
      placedWorld = copy;
      return true;
    });
    if (!settlements || !placedWorld) continue;
    return { world: placedWorld, settlements, attempt, usedFallback: false };
  }
  return fallbackWorld(seed);
}

/** Committed fallback template: a hand-designed valid layout, mirrored by the seed. */
export function fallbackWorld(seed: string): GenerationResult {
  const rng = makeRng(seed, "map", "fallback");
  const flipX = rng.next() < 0.5;
  const flipY = rng.next() < 0.5;
  const world = createEmptyWorld();
  const W = world.width,
    H = world.height;
  const set = (x: number, y: number, t: number) => {
    const fx = flipX ? W - 1 - x : x;
    const fy = flipY ? H - 1 - y : y;
    if (fx >= 0 && fy >= 0 && fx < W && fy < H) world.terrain[tileId(fx, fy)] = t;
  };
  const at = (x: number, y: number) => tileId(flipX ? W - 1 - x : x, flipY ? H - 1 - y : y);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, Terrain.Meadow);
  // Western forest block and eastern woods.
  for (let y = 30; y <= 52; y++) for (let x = 40; x <= 56; x++) set(x, y, Terrain.Forest);
  for (let y = 15; y <= 45; y++) for (let x = 100; x <= 125; x++) set(x, y, Terrain.Forest);
  for (let y = 62; y <= 88; y++) for (let x = 15; x <= 35; x++) set(x, y, Terrain.Forest);
  for (let y = 60; y <= 70; y++) for (let x = 50; x <= 56; x++) set(x, y, Terrain.Forest);
  // Central ridge and an eastern range.
  for (let y = 30; y <= 38; y++) for (let x = 66; x <= 90; x++) set(x, y, Terrain.Mountain);
  for (let y = 60; y <= 80; y++) for (let x = 110; x <= 118; x++) set(x, y, Terrain.Mountain);
  // Main lake south of the ridge and a small tarn west of it.
  for (let y = 38; y <= 50; y++)
    for (let x = 62; x <= 90; x++) {
      const dx = (x - 76) / 11,
        dy = (y - 44) / 5;
      if (dx * dx + dy * dy <= 1) set(x, y, Terrain.Water);
    }
  for (let y = 39; y <= 47; y++)
    for (let x = 56; x <= 70; x++) {
      const dx = (x - 63) / 6.5,
        dy = (y - 43) / 3.5;
      if (dx * dx + dy * dy <= 1) set(x, y, Terrain.Water);
    }
  // A north–south river with fords.
  for (let y = 5; y < 95; y++) if (y % BALANCE.map.fordSpacing !== 0) set(97 + (y % 7 < 3 ? 0 : 1), y, Terrain.Water);

  fillResources(world, seed, 99);
  const settlements: Settlements = {
    stonehaven: at(65, 38),
    windstep: at(42, 45),
    hearthwood: at(60, 64),
    ironfang: at(86, 62),
  };
  const check = validatePlacement(world, settlements);
  if (!check.ok) throw new Error(`fallback template invalid: ${check.reason}`);
  const territory = claimStartTerritory(world, settlements);
  if (!territoryGapOk(world, territory)) throw new Error("fallback template territories too close");
  if (!placeStartingAssets(world, settlements, territory)) throw new Error(`fallback template assets invalid: ${lastAssetFailure}`);
  return { world, settlements, attempt: BALANCE.map.maxGenerationAttempts, usedFallback: true };
}

export function initialTribe(id: TribeId, settlement: number): TribeState {
  const profile = TRIBES[id];
  const others = TRIBE_IDS.filter((t) => t !== id);
  return {
    id,
    alive: true,
    eliminatedTurn: null,
    settlement,
    outposts: [],
    scoutedSites: [],
    population: STARTING.population,
    food: id === "ironfang" ? STARTING.food.ironfang : STARTING.food.producing,
    timber: STARTING.timber,
    stone: STARTING.stone,
    morale: STARTING.morale,
    militaryLevel: id === "ironfang" ? STARTING.military.ironfang : STARTING.military.other,
    camp: profile.startingShelter === "camp" ? { capacity: STARTING.housingCapacity, condition: 100 } : null,
    learned: [],
    project: null,
    birthAccumulator: 0,
    recentActions: [],
    memory: [],
    relations: Object.fromEntries(others.map((o) => [o, 0])) as Partial<Record<TribeId, number>>,
    history: [],
    milestones: [],
    lastFoodDeficit: false,
    lastExposureLoss: 0,
    fate: null,
    absorbedBy: null,
  };
}

export function createInitialState(seed: string, contentVersion: string, contentHash: string, totalTurns = DEFAULT_TOTAL_TURNS): GameState {
  if (!Number.isInteger(totalTurns) || totalTurns < MIN_TOTAL_TURNS || totalTurns > MAX_TOTAL_TURNS) throw new Error("invalid match length");
  const gen = generateWorld(seed);
  const tribes = {} as Record<TribeId, TribeState>;
  for (const id of TRIBE_IDS) tribes[id] = initialTribe(id, gen.settlements[id]);
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    contentVersion,
    contentHash,
    seed,
    generationAttempt: gen.attempt,
    usedFallbackMap: gen.usedFallback,
    completedTurn: 0,
    totalTurns,
    world: gen.world,
    tribes,
    activeEffects: [],
    queuedEffects: [],
    eventBag: { order: [], position: 0, refills: 0 },
    recentEventIds: [],
    currentEvent: null,
    effectCounter: 0,
    unionOffers: [],
  };
}

export function countTerrain(world: WorldState): Record<string, number> {
  const c = [0, 0, 0, 0];
  for (let i = 0; i < TILE_COUNT; i++) {
    const t = world.terrain[i] as number;
    c[t] = (c[t] as number) + 1;
  }
  return { water: c[0] as number, meadow: c[1] as number, forest: c[2] as number, mountain: c[3] as number };
}

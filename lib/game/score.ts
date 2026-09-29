import { BALANCE } from "@/content/balance";
import { inWorkingRange, type TribeGeo } from "./geo";
import { shelterCoverage } from "./shelter";
import { TILE_COUNT, TRIBE_IDS, Terrain, type GameState, type ScoreBreakdown, type TribeId } from "./types";

/** Distinct claimed land tiles in working range with renewable capacity, a usable building, farm suitability, or stone. */
export function productiveOwnedTiles(state: GameState, tribe: TribeId, geo: TribeGeo): number {
  const w = state.world;
  const idx = TRIBE_IDS.indexOf(tribe);
  let n = 0;
  for (let t = 0; t < TILE_COUNT; t++) {
    if (w.owner[t] !== idx || w.terrain[t] === Terrain.Water || !inWorkingRange(geo, t)) continue;
    const renewable = (w.cap.forage[t] as number) + (w.cap.wildlife[t] as number) + (w.cap.timber[t] as number) > 0.5;
    const building = w.assetAt[t] !== -1;
    const farmable = w.terrain[t] === Terrain.Meadow && (w.fertility[t] as number) > 0;
    const stone = (w.stock.stone[t] as number) > 0.5;
    if (renewable || building || farmable || stone) n++;
  }
  return n;
}

export function scoreTribe(state: GameState, tribe: TribeId, geo: TribeGeo | undefined): ScoreBreakdown {
  const t = state.tribes[tribe];
  if (!t.alive || t.population <= 0 || !geo) return { population: 0, resilience: 0, development: 0, influence: 0, total: 0 };
  const S = BALANCE.score;
  const population = S.population.weight * Math.min(t.population / S.population.target, 1);
  const foodPart = Math.min(t.food / (S.resilience.foodTurns * Math.max(t.population, 1)), 1);
  const resilience = S.resilience.weight * (S.resilience.foodShare * foodPart + S.resilience.shelterShare * shelterCoverage(state, tribe, geo));
  const development = (S.development.weight * t.learned.length) / S.development.techs;
  const influence = S.influence.weight * Math.min(productiveOwnedTiles(state, tribe, geo) / S.influence.tiles, 1);
  return { population, resilience, development, influence, total: population + resilience + development + influence };
}

/** Winners share an exact highest score; never broken by name or processing order. */
export function winners(scores: Record<TribeId, ScoreBreakdown>): TribeId[] {
  const living = TRIBE_IDS.filter((id) => scores[id].total > 0);
  if (living.length === 0) return [];
  const best = Math.max(...living.map((id) => scores[id].total));
  return living.filter((id) => scores[id].total === best);
}

export function displayScore(v: number): string {
  return v.toFixed(1);
}

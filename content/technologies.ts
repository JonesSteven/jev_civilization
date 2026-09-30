import { BALANCE, SCALE } from "@/content/balance";
import type { ResourceAmounts } from "@/lib/game/types";

const x = (f: number) => `×${f}`;

export interface TechnologyDef {
  id: string;
  name: string;
  effortTurns: number;
  cost: ResourceAmounts;
  prerequisites: string[];
  effect: string;
}

export const TECHNOLOGIES: TechnologyDef[] = [
  {
    id: "agriculture",
    name: "Agriculture",
    effortTurns: 2,
    cost: { food: 40 * SCALE, timber: 20 * SCALE, stone: 0 },
    prerequisites: [],
    effect: `Unlocks farms; farm yield ${x(BALANCE.tech.agricultureFarm)} (also for innate farmers).`,
  },
  {
    id: "fishing",
    name: "Fishing",
    effortTurns: 2,
    cost: { food: 20 * SCALE, timber: 20 * SCALE, stone: 0 },
    prerequisites: [],
    effect: `Unlocks fisheries; fishery yield ${x(BALANCE.tech.fishingFishery)}.`,
  },
  {
    id: "masonry",
    name: "Masonry",
    effortTurns: 3,
    cost: { food: 30 * SCALE, timber: 0, stone: 20 * SCALE },
    prerequisites: [],
    effect: "Unlocks stone housing and stone repair.",
  },
  {
    id: "food_storage",
    name: "Food Storage",
    effortTurns: 3,
    cost: { food: 0, timber: 30 * SCALE, stone: 10 * SCALE },
    prerequisites: [],
    effect: `Food spoilage falls from ${Math.round(BALANCE.population.spoilage * 100)}% to ${Math.round(BALANCE.population.storageSpoilage * 100)}% per turn.`,
  },
  {
    id: "irrigation",
    name: "Irrigation",
    effortTurns: 4,
    cost: { food: 0, timber: 40 * SCALE, stone: 20 * SCALE },
    prerequisites: ["agriculture"],
    effect: `Drought cannot cut farm output below ${Math.round(BALANCE.production.irrigationDryFloor * 100)}%. Does not prevent flood or fire destruction.`,
  },
  {
    id: "tools",
    name: "Tools",
    effortTurns: 3,
    cost: { food: 0, timber: 20 * SCALE, stone: 20 * SCALE },
    prerequisites: [],
    effect: `Active timber and stone gathering ${x(BALANCE.tech.toolsGather)}.`,
  },
  {
    id: "fortification",
    name: "Fortification",
    effortTurns: 4,
    cost: { food: 0, timber: 30 * SCALE, stone: 30 * SCALE },
    prerequisites: [],
    effect: `Unlocks fortification levels 3–5 (ordinary defenses cap at 2); each level adds ${Math.round(BALANCE.combat.fortStep * 100)}% defense.`,
  },
  {
    id: "logistics",
    name: "Logistics",
    effortTurns: 4,
    cost: { food: 40 * SCALE, timber: 20 * SCALE, stone: 0 },
    prerequisites: [],
    effect: `Working range +${BALANCE.territory.logisticsRangeBonus}; movement budget +${BALANCE.movement.logisticsBonus}.`,
  },
];

export const TECH_BY_ID: Record<string, TechnologyDef> = Object.fromEntries(TECHNOLOGIES.map((t) => [t.id, t]));

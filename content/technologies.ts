import type { ResourceAmounts } from "@/lib/game/types";

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
    cost: { food: 40, timber: 20, stone: 0 },
    prerequisites: [],
    effect: "Unlocks farms; farm yield ×1.15 (also for innate farmers). Enables food gathering for Ironfang.",
  },
  {
    id: "fishing",
    name: "Fishing",
    effortTurns: 2,
    cost: { food: 20, timber: 20, stone: 0 },
    prerequisites: [],
    effect: "Unlocks fisheries; fishery yield ×1.15. Enables food gathering for Ironfang.",
  },
  {
    id: "masonry",
    name: "Masonry",
    effortTurns: 2,
    cost: { food: 30, timber: 0, stone: 20 },
    prerequisites: [],
    effect: "Unlocks stone housing and stone repair.",
  },
  {
    id: "food_storage",
    name: "Food Storage",
    effortTurns: 2,
    cost: { food: 0, timber: 30, stone: 10 },
    prerequisites: [],
    effect: "Food spoilage falls from 5% to 2% per turn.",
  },
  {
    id: "irrigation",
    name: "Irrigation",
    effortTurns: 3,
    cost: { food: 0, timber: 40, stone: 20 },
    prerequisites: ["agriculture"],
    effect: "Dry-weather farm multipliers cannot fall below 0.6. Does not prevent flood or fire destruction.",
  },
  {
    id: "tools",
    name: "Tools",
    effortTurns: 2,
    cost: { food: 0, timber: 20, stone: 20 },
    prerequisites: [],
    effect: "Active timber and stone gathering ×1.25.",
  },
  {
    id: "fortification",
    name: "Fortification",
    effortTurns: 3,
    cost: { food: 0, timber: 30, stone: 30 },
    prerequisites: [],
    effect: "Unlocks fortification levels 3–5 (ordinary defenses cap at 2).",
  },
  {
    id: "logistics",
    name: "Logistics",
    effortTurns: 3,
    cost: { food: 40, timber: 20, stone: 0 },
    prerequisites: [],
    effect: "Working range 12 instead of 8; movement budget +2.",
  },
];

export const TECH_BY_ID: Record<string, TechnologyDef> = Object.fromEntries(TECHNOLOGIES.map((t) => [t.id, t]));

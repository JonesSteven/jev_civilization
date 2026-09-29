import { BALANCE } from "./balance";

export interface HelpSection {
  id: string;
  title: string;
  body: string[];
}

const S = BALANCE.score;

export const HELP: HelpSection[] = [
  {
    id: "objective",
    title: "Your role",
    body: [
      "You support one tribe, but you cannot give orders to anyone. On odd turns you choose how the environment changes; on even turns Nature chooses at random.",
      "Every turn, Jev (TypeSafe's decision model) chooses one major action for each surviving tribe from the legal actions the game engine lists. The game engine then calculates all results.",
      "The match length (10–200 turns, default 50) is chosen at the start. When it ends, the tribe with the highest civilization score wins. Exact ties are shared victories.",
    ],
  },
  {
    id: "turns",
    title: "Turns and seasons",
    body: [
      "Two turns make a season and eight turns make a year, starting in spring. You choose the early turn of every season; Nature chooses the late turn.",
      "An environmental choice is announced before tribes decide, so they can prepare for it. Every choice applies to the whole land; tribes feel it differently depending on their terrain, food sources, and shelter.",
      "Effects with a duration apply on the turn they start and following turns. Permanent changes such as new forest or fertile soil stay on the map.",
    ],
  },
  {
    id: "economy",
    title: "Food, shelter, and growth",
    body: [
      "One food feeds one person for one turn. Farms, hunting sites, fisheries, and foraging keep producing every turn without being chosen again.",
      "Hunger kills 10% of the unfed share of the population. In winter, people without shelter suffer exposure.",
      "Births happen only with no food shortage, spare shelter, and morale of at least 50: 4% per turn, 7% while stores cover four turns. Stored food spoils each turn (less with Food Storage).",
      "Borders grow on their own: each turn a tribe claims about one unclaimed border tile per 40 people (up to six). Bigger tribes also work land farther from their settlements.",
      "Tribes can send scouts to find open land and then found a new settlement there (up to three). People, food, and technologies are shared across all of a tribe's settlements.",
    ],
  },
  {
    id: "score",
    title: "Civilization score (0–100)",
    body: [
      `Population: ${S.population.weight} × min(population ÷ ${S.population.target}, 1).`,
      `Resilience: ${S.resilience.weight} × (${S.resilience.foodShare} × min(food ÷ (${S.resilience.foodTurns} × population), 1) + ${S.resilience.shelterShare} × shelter coverage).`,
      `Development: ${S.development.weight} × technologies learned ÷ ${S.development.techs}.`,
      `Influence: ${S.influence.weight} × min(productive tiles in working range ÷ ${S.influence.tiles}, 1).`,
      "Military strength is not scored directly; it helps a tribe take resources and survive. Eliminated tribes score zero.",
    ],
  },
  {
    id: "jev",
    title: "What Jev sees and decides",
    body: [
      "Each turn the server sends Jev one batch: a shared world summary, a detailed view for each tribe, and one Choice question per tribe listing only that tribe's legal actions.",
      "Jev returns a probability for every listed action. The game executes the highest-probability action; it never samples or overrides.",
      "Jev's probabilities are action preferences, not chances of success. Raid success is a separate game-engine calculation shown in candidate descriptions.",
      "The prompt never includes which tribe you support, the seed, or future Nature choices.",
    ],
  },
  {
    id: "combat",
    title: "Raids and defense",
    body: [
      "Attack = population × (1 + 0.25 × military level) × raid trait. Defense = population × (1 + 0.25 × military) × (1 + 0.2 × fortification) × terrain (mountain 1.25) × Defend (1.5).",
      "Raids reach up to 36 travel units, recruiting 24, and scouting 40, measured over base terrain. Harsh travel conditions (winter or a travel penalty) shorten that reach by 25% per step; easy conditions lengthen it. Weather also changes how far a capital can relocate.",
      "Success chance = attack ÷ (attack + defense), limited to 10–90%. A successful raid takes up to 200 food, 50 timber, and 25 stone, and captures up to four border tiles that touch the raider's territory.",
      "If the target relocates on the same turn, its stores travel with it and the raid finds nothing.",
    ],
  },
  {
    id: "modes",
    title: "Live, mock, and replay",
    body: [
      "Live games call Jev for every turn. If Jev is unavailable the turn pauses with a Retry button; nothing is simulated with a hidden fallback.",
      "Mock simulation games use a deterministic local test policy instead of Jev and are labeled Mock everywhere.",
      "Replays show recorded decisions and make no model calls.",
    ],
  },
];

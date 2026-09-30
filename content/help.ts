import { BALANCE, STARTING } from "./balance";

export interface HelpSection {
  id: string;
  title: string;
  body: string[];
}

const S = BALANCE.score;
const P = BALANCE.population;
const U = BALANCE.union;
const C = BALANCE.combat;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export const HELP: HelpSection[] = [
  {
    id: "objective",
    title: "In a nutshell",
    body: [
      "You support one tribe but never give it orders. You shape the weather and the land instead. When you set up a match you choose how: you make every choice, you and the computer (\"Nature\") take turns, or the computer plays alone while you watch.",
      "When the computer chooses, it can help your tribe (picking what is best for it compared with its rivals), hurt it, or choose at random. When you take turns, you read Nature's pick and the event log, then press \"Proceed to my turn\". A computer-only match plays itself; use Pause to stop it.",
      "Each turn Jev (TypeSafe's decision model) picks one action for every tribe. The game engine then works out the harvests, hunger, births, raids, and borders.",
      "After each turn a short summary says who gained or lost people and why. The match ends at its turn limit (10–200 turns) or as soon as only one tribe is left.",
    ],
  },
  {
    id: "luck",
    title: "Luck shapes history",
    body: [
      "Like the civilizations in Guns, Germs, and Steel, the tribes are not better or worse people: where they live and what happens to them decides their fate. Many events strike just one region, so a blizzard or a plague can cripple one tribe while its neighbour thrives.",
      `Small edges compound. A thriving, well-fed tribe grows up to ${pct(P.birthRate + P.wellFedBirthBonus)} a turn, while a tribe that has shrunk in the last ${P.momentumTurns} turns grows only ${pct(P.birthRate)}. Larger tribes also research faster, so an early lucky harvest or a new technology can snowball.`,
      "Settled farmers resist epidemics far better than hunters and raiders, who have never lived beside their animals. Sickness also spreads to neighbours whose land touches the stricken tribe.",
    ],
  },
  {
    id: "choosing",
    title: "Choosing the environment",
    body: [
      "The event card shows where the event strikes (a highlighted region, or the whole land) and which tribes live there. Each option says which tribes it is likely to help or hurt.",
      "The score is a ranking, so hurting a rival can matter as much as helping your own tribe. Open \"Details\" on an option to see its exact effects.",
      "Effects with a duration last that many turns. Fertility, capacity, and terrain changes are permanent.",
    ],
  },
  {
    id: "tribes",
    title: "How each tribe lives",
    body: [
      "Hearthwood (farmers) lives on farms. Crop pests, droughts, frosts, and floods hurt it; good rains and warm summers help. Its wooden homes shrug off weather, and it resists sickness best.",
      "Windstep (hunters) lives on wild game and moves easily. Vanishing herds and shelter-wrecking storms hurt it; herd migrations help. Its portable camps suffer in freezing rain.",
      "Stonehaven (mountain fishers) lives on fisheries and shelters in caves and stone. Ice, storms, and failed spawning hurt it; salmon runs and steady rivers help.",
      "Ironfang (raiders) hunts, forages, and raids but has no farms or fisheries until it learns Agriculture or Fishing. It takes food and land from neighbours and can conquer a shattered one.",
    ],
  },
  {
    id: "growth",
    title: "Growth, hunger, and collapse",
    body: [
      `Tribes start with ${STARTING.population.toLocaleString("en-US")} people. One food feeds one person for one turn. Farms, hunting sites, fisheries, and foraging produce every turn.`,
      `A fed tribe with morale of at least ${P.birthMinMorale} grows ${pct(P.birthRate)} a turn, or ${pct(P.birthRate + P.wellFedBirthBonus)} while its stores cover ${P.wellFedTurns} turns and it has not shrunk for ${P.momentumTurns} turns. Growth can outrun housing, but people without shelter die of cold in winter and in storms.`,
      `Hunger is deadly: a tribe with no food at all loses ${pct(P.starvationRate)} of its people in a turn. A tribe that falls below ${P.collapseBelow} people breaks apart and disappears.`,
    ],
  },
  {
    id: "unions",
    title: "Unions and conquest",
    body: [
      `A tribe at least ${U.sizeRatio} times larger than a declining neighbour of ${U.minPopulation}+ people (or ${U.overwhelmingRatio} times larger than a steady one) offers to take it in. The smaller tribe decides on one of the next ${U.offerTurns} turns; if it accepts, about ${pct(U.joinShare)} of its people join, bringing their land, stores, and technologies.`,
      `A tribe left with fewer than ${C.conquestBelow} people after a successful raid by a tribe at least ${C.conquestRatio} times larger is conquered: about ${pct(C.conquestJoinShare)} of its survivors are taken in.`,
    ],
  },
  {
    id: "combat",
    title: "Raids",
    body: [
      `Attack = population × (1 + ${C.militaryStep} × military level) × raid trait. Defense = population × (1 + ${C.militaryStep} × military) × (1 + ${C.fortStep} × fortification) × terrain (mountain ${C.mountainDefense}) × Defend (${BALANCE.actions.defendMultiplier}), and ×${C.alertDefense} for a tribe raided in the last two turns.`,
      `Success chance = attack ÷ (attack + defense), limited to ${pct(C.minChance)}–${pct(C.maxChance)}. A successful raid takes stores and up to ${BALANCE.territory.raidCaptureTiles} border tiles and kills about ${pct(C.successLoss.defender)} of the defenders; a failed raid costs the attacker about ${pct(C.failureLoss.attacker)}.`,
      "If the target moves its capital on the same turn, the raid finds nothing.",
    ],
  },
  {
    id: "score",
    title: "Winning (civilization score 0–100)",
    body: [
      `Population: ${S.population.weight} × min(population ÷ ${S.population.target.toLocaleString("en-US")}, 1).`,
      `Resilience: ${S.resilience.weight} × (${S.resilience.foodShare} × min(food ÷ (${S.resilience.foodTurns} × population), 1) + ${S.resilience.shelterShare} × shelter coverage).`,
      `Development: ${S.development.weight} × technologies learned ÷ ${S.development.techs}. Influence: ${S.influence.weight} × min(productive tiles in working range ÷ ${S.influence.tiles}, 1).`,
      "Tribes that are gone score zero. The last tribe standing wins outright.",
    ],
  },
  {
    id: "jev",
    title: "What Jev sees and decides",
    body: [
      "Each turn the server sends Jev one batch: a shared world summary, a detailed view for each tribe, and one question per tribe listing only that tribe's legal actions.",
      "Jev returns a preference for every listed action and the game executes the favourite. The decision inspector shows exactly what Jev was told and what it preferred.",
      "The prompt never includes which tribe you support, the seed, or future Nature choices.",
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

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
    id: "choosing",
    title: "Choosing changes for your tribe",
    body: [
      "Every environmental choice affects the whole land, so the same change helps some tribes and hurts others depending on what they live on. The tribes below differ in how they get food, what they shelter in, and how they interact with neighbours.",
      "Think in relative terms: the score is a ranking, so a choice that hurts rivals more than your tribe can be as useful as one that helps your tribe directly. Check the tribe panel for each tribe's food sources, food turns left, and shelter before you choose.",
      "The event card lists the exact effects of each option. Effects with a duration last that many turns; fertility, capacity, and terrain changes are permanent.",
    ],
  },
  {
    id: "tribe-hearthwood",
    title: "Supporting Hearthwood (farmers)",
    body: [
      "Hearthwood's food comes mainly from farms (+15% farm yield), so crop conditions and meadow fertility matter most. Farms and wooden homes also cost timber, so healthy forests nearby matter too.",
      "Usually helpful: Season of Rain: Steady rain; Summer Heat: Warm summer; Pollinator Bloom: In the meadows; Length of the Harvest: Extended season; Before Winter: Clear skies; A Thriving Species: Pollinators. Permanent soil gains (Seeds on the Wind: Wild wheat, Erosion: Fertile soil, Changing Soil: Rich soil, Windstorm Deposits: Silt) keep paying off every turn.",
      "Usually harmful: Crop Pest: Through wheat fields; Summer Heat: Scorching summer (halves farm output unless the tribe has learned Irrigation); Before Winter: Early frost; Length of the Harvest: Brief season; Landslide: At the meadow edge and Changing Soil: Stony soil (permanent fertility loss). Fires and canopy pests cut the timber Hearthwood builds with.",
      "Weather damage to shelter matters less: Hearthwood's wooden homes take half the ordinary damage, so freezing rain and storms usually hurt rivals in camps more.",
    ],
  },
  {
    id: "tribe-windstep",
    title: "Supporting Windstep (hunters)",
    body: [
      "Windstep's hunting sites draw on wildlife in the surrounding land, and its gathering yields 30% more. Wildlife stocks and how fast they regrow are its lifeline; heavy hunting depletes an area, which is why Windstep moves, scouts, and founds new settlements readily.",
      "Usually helpful: Herd Migration (whichever terrain surrounds its sites); Forest Understory: Thick brush; Wildlife Recovery: Rapidly; A Thriving Species: Grazers; Recovery: Wildlife; Shifting Edges: Mixed edge grows. Changes that restore forage, such as Wild Harvest or Recovering Ground: Shrubs, also help its gathering.",
      "Usually harmful: Length of the Harvest: Brief season (hunting −15%); Crop Pest: Through wild fruit. Windstep lives in portable camps, which take extra weather damage, so Freezing rain, Wet winter, Fallen branches, and violent storms wear its shelter down. Its camps are hardy against cold, though, so harsh winters hurt it less than their shelter damage suggests.",
      "Easy travel (clear skies, dry ground, thick ice, winter route choices) makes Windstep's moves and scouting reach farther.",
    ],
  },
  {
    id: "tribe-stonehaven",
    title: "Supporting Stonehaven (mountain fishers)",
    body: [
      "Stonehaven's food comes mainly from fisheries (+45% fishing yield), so fish stocks and fishing conditions matter most. It builds in stone (+30% quarrying), and its cave and stone shelters shrug off most weather damage. Farming is only available after it learns Agriculture.",
      "Usually helpful: Fish Spawning: Abundant or Scattered spawning; A Thriving Species: Fish; River Flow: High flow (replenishes fish, though it floods fields near water) or Stable flow; Erosion: Stone or Caves; Natural Shelter: Caves.",
      "Usually harmful: Winter's Character: Bitter winter (fishing −40%); Winter Ice: Thick ice (fishing −60%) or Uneven ice; Storm Season: Persistent storms; Fish Spawning: Poor spawning; River Flow: Low flow; Spreading Vegetation: Reeds. Because its homes are durable, shelter-damaging events usually hurt rivals more than Stonehaven.",
      "If its shores run low, scouting for a new settlement beside fresh water is often Stonehaven's best way to grow.",
    ],
  },
  {
    id: "tribe-ironfang",
    title: "Supporting Ironfang (raiders)",
    body: [
      "Ironfang starts with no farms, fisheries, or foraging. It lives on its starting stores and on raids (+50% attack), which take food and border land from neighbours. It can grow its own food only after learning Agriculture or Fishing.",
      "Raiding reach depends on travel conditions at Ironfang's capital: each step of travel penalty shortens its reach by 25%, and each step of easier travel lengthens it. Winter adds a penalty. Choices that ease travel everywhere (Before Winter: Clear skies, Changing Soil: Dry soil, Winter Ice: Thick ice, and the matching Winter Routes choice) extend its reach. Choices that slow travel everywhere (Torrential rain, Sudden thaw, Rain clouds, Heavy rain, Persistent storms, Uneven ice, Heavy snow, Long rains) can leave it with no one in range.",
      "Ironfang benefits indirectly when its neighbours are well stocked, since raids take from their stores, and when their defences are weak. Its portable camps take extra weather damage, so Freezing rain and Wet winter hurt it.",
      "Once Ironfang learns Agriculture, the farming advice for Hearthwood starts to apply to it as well.",
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

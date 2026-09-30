// Versioned balance defaults. Every tunable number used by the engine lives here.
// Changes after playtesting must be recorded in BALANCE_CHANGELOG below and in HANDOFF.md.

export const RULES_VERSION = "rules-3.0.0";

/**
 * Population scale. Tribes start with about 1,000 people; every people-, food-, and material-denominated
 * number below is expressed as a base value × SCALE so the ratios stay readable.
 */
export const SCALE = 10;

export const BALANCE_CHANGELOG: { version: string; change: string }[] = [
  { version: "rules-3.0.0", change: "Live Jev check: housing was chosen about half the times it was affordable, but at 30 timber per turn it was affordable only about one turn in seven (Jev almost never gathers timber). Routine timber 30→80 and stone 20→50 per turn. The prompt now also explains shelter, the birth limit, and fresh land (views.<tribe>.advisories and candidate text)." },
  { version: "rules-3.0.0", change: "Live Jev check: Windstep left the game in 5 of 6 departures across 12 live matches. Windstep hunt and gathering ×1.3→1.5; wildlife regrowth 0.30→0.35; Windstep hunting sites draw from radius 4 (was 3)." },
  { version: "rules-3.0.0", change: "Live Jev check: tribes rarely build housing, so shelter-capped births froze populations at the starting 1,200. Births now follow food (up to 1.5× shelter); the unsheltered face winter exposure instead." },
  { version: "rules-3.0.0", change: "Live Jev check: after a famine, morale stayed under the birth threshold for 20+ turns. Morale now drifts +3/turn toward 60 without hunger or cold (driftTarget was defined but unused)." },
  { version: "rules-3.0.0", change: "Mock and live runs: a raider hitting one neighbour every turn dominated (one live Windstep was raided on 25 straight turns). Raid casualties 15%→6% (defender on success) and a tribe raided in the last two turns defends at ×1.6." },
  { version: "rules-3.0.0", change: "Survivors converged to similar sizes by turn 100. Research now scales with population (+1 effort per 3,000 people, max 4), later technologies take 3–4 effort turns, up to 5 settlements, and a tribe 8× larger may offer a union even to a steady neighbour." },
  { version: "rules-3.0.0", change: "Dramatic ruleset (playtest feedback: outcomes too even, no tribe ever lost). Populations ×10 (start 1,000); many events now strike one region instead of the whole map; harsher starvation, exposure, and raids; stronger technologies and faster well-fed growth; epidemics that spare dense farmers; tribes collapse below a minimum size; a much larger tribe can offer a union to a declining neighbour, and a raid can conquer a remnant; the match ends when one tribe is left." },
  { version: "rules-2.0.0", change: "Live check: Hearthwood scouted 7 times but never had 30 timber to found. Founding cost 40 food + 30 timber → 80 food + 10 timber; scouting text now states the founding cost and current stores." },
  { version: "rules-2.0.0", change: "Live check: world-wide travel penalties removed raid options on 43 of 48 turns. Raid/recruit/scout reach now uses base terrain costs scaled 25% per travel-penalty step at the capital (bounded 50–125%); relocation still uses full weather costs." },
  { version: "rules-2.0.0", change: "Dynamic tuning (mock-policy runs): Hearthwood farm ×1.25→1.15, Stonehaven fish ×1.25→1.45, Ironfang raid ×1.25→1.5, food loot cap 200→300. 40-game win shares moved from 66/25/6/3% to 48/35/10/8%." },
  { version: "rules-2.0.0", change: "Dynamic branch (playtest feedback): starts ≥26 apart with a 6-tile territory gap; match length 10–200 (default 50); start population 100, shelter 120, food 400/700, 4 starting sites; births 4% (+3% well fed at ≥4 turns); housing 40/40/30; working range 8 + pop/60 (max 16, Logistics +4); organic border growth; raids capture up to 4 border tiles; loot caps ×2.5; raid range 36, recruit range 24; raids cost up to 15 food (or whatever remains) so an empty larder never locks raiders out; scouts and up to 3 settlements; all events apply to the whole map; score targets population 600, influence 400." },
  { version: "rules-1.0.0", change: "Initial PRD defaults; resource capacities and regeneration rates documented below." },
  { version: "rules-1.0.0", change: "Playtest: wildlife capacity meadow 4.5/forest 7/mountain 3 with regen 0.2, fish 16/tile, so one site can sustain ~18/turn at moderate depletion." },
  { version: "rules-1.0.0", change: "Playtest: added labor (8 workers per food site) to stop unbounded farm stacking and runaway food stocks." },
  { version: "rules-1.0.0", change: "Playtest: wildlife regen 0.2→0.3, fish regen 0.25→0.35; mock-policy win share Hearthwood 74%→~47% (100-game runs), depleting food sources were too punishing." },
  { version: "rules-1.0.0", change: "Playtest: +1% birth rate while food covers ≥6 turns, so surplus becomes growth instead of runaway stockpiles; memories expire after 16 turns." },
  { version: "rules-1.0.0", change: "Playtest: Stonehaven starting fisheries require ≥80 fish within radius 3 (tiny streams made starts nonviable)." },
];

export const BALANCE = {
  map: {
    width: 150,
    height: 100,
    /** Target terrain shares used by the generator thresholds. */
    waterShare: 0.12,
    mountainShare: 0.13,
    forestShare: 0.32,
    riverCount: 5,
    fordSpacing: 14,
    maxGenerationAttempts: 6,
    maxPlacementAttemptsPerMap: 400,
  },

  travel: {
    meadow: 1,
    forest: 2,
    mountain: 3,
    stonehavenMountain: 2,
    minCost: 1,
    maxCost: 6,
    /** Added to all land travel in winter. */
    winterPenalty: 1,
    /**
     * Raid, recruit, and scouting reach use base terrain costs, scaled by travel conditions at the capital:
     * each +1 travel penalty shortens reach by this share (each −1 lengthens it), bounded to [min, max].
     */
    reachStepPerPenalty: 0.25,
    reachMin: 0.5,
    reachMax: 1.25,
    /**
     * Working range (which sites produce) uses base terrain costs only, so temporary weather does not
     * switch whole farms on and off. Travel modifiers affect movement, raid/recruit range, and expansion.
     */
    workingRangeUsesBaseCosts: true,
  },

  placement: {
    minSeparation: 26,
    neighborWithin: 48,
    raidTargetWithin: 36,
    startTerritoryTiles: 36,
    /** No start-territory tile may lie within this Manhattan distance of another tribe's start territory. */
    minTerritoryGap: 6,
  },

  territory: {
    workingRange: 8,
    /** Working range grows with population: +1 per `rangePerPopulation` people, capped at `maxWorkingRange`. */
    rangePerPopulation: 60 * SCALE,
    maxWorkingRange: 18,
    logisticsRangeBonus: 6,
    expandTiles: 16,
    /** Organic border growth each turn: floor(population / growthPerTiles) unclaimed border tiles, capped. */
    growthPerTiles: 40 * SCALE,
    maxGrowthTilesPerTurn: 8,
    /** Border tiles a successful raid takes from the defender. */
    raidCaptureTiles: 6,
    siteRadius: 3, // hunting/fishery draw radius (Manhattan)
  },

  movement: {
    base: 6,
    windstep: 10,
    ironfang: 8,
    logisticsBonus: 2,
  },

  /**
   * Tile resource capacities and regeneration (fraction of the missing amount regained per turn).
   * Stocks never exceed capacity and never go below zero.
   */
  resources: {
    forage: { meadow: 2.5 * SCALE, forest: 3.5 * SCALE, mountain: 0.6 * SCALE, shoreBonus: 0.5 * SCALE, regen: 0.18 },
    wildlife: { meadow: 4.5 * SCALE, forest: 7 * SCALE, mountain: 3 * SCALE, regen: 0.35 },
    fish: { water: 16 * SCALE, regen: 0.35 },
    timber: { forest: 14 * SCALE, meadow: 0.5 * SCALE, mountain: 0.5 * SCALE, regen: 0.04 },
    stone: { mountain: 22 * SCALE, meadow: 0.3 * SCALE, forest: 0.3 * SCALE, regen: 0.01 },
    fertility: { meadowMin: 70, meadowMax: 130, forestDefault: 55, max: 200 },
  },

  production: {
    farm: 18 * SCALE,
    hunt: 18 * SCALE,
    fishery: 18 * SCALE,
    forage: 20 * SCALE,
    routineTimber: 8 * SCALE,
    routineStone: 5 * SCALE,
    season: {
      farm: { spring: 0.8, summer: 1.2, autumn: 1.4, winter: 0.2 },
      hunt: { spring: 1.0, summer: 1.0, autumn: 1.0, winter: 0.8 },
      fish: { spring: 1.0, summer: 1.1, autumn: 1.0, winter: 0.6 },
      forage: { spring: 0.9, summer: 1.1, autumn: 1.2, winter: 0.4 },
    },
    irrigationDryFloor: 0.9,
    /** Labor: each active farm, hunting site, or fishery needs this many people for full output. */
    workersPerSite: 8 * SCALE,
    modifierMin: 0.1,
    modifierMax: 3.0,
  },

  tribeMods: {
    hearthwood: { farm: 1.15, timber: 1.25, woodWeatherDamage: 0.5 },
    windstep: { hunt: 1.5, gatherFood: 1.5, campExposure: 0.6, huntRadiusBonus: 1 },
    stonehaven: { stone: 1.3, fish: 1.45 },
    ironfang: { raid: 1.5 },
  },

  /**
   * Share of an epidemic's deaths each tribe suffers. Dense farming villages that live beside their animals
   * carry old immunities (the "germs" of Guns, Germs, and Steel); scattered hunters and raiders do not.
   */
  diseaseResistance: { hearthwood: 0.35, windstep: 1.0, stonehaven: 0.8, ironfang: 1.0 },

  /**
   * Larger populations invent faster: each research action adds 1 effort turn, plus 1 for every
   * `peoplePerExtraEffort` people, up to `maxEffortPerTurn`.
   */
  research: { peoplePerExtraEffort: 300 * SCALE, maxEffortPerTurn: 4 },

  tech: {
    agricultureFarm: 1.6,
    fishingFishery: 1.5,
    toolsGather: 1.6,
  },

  actions: {
    restMorale: 4,
    gatherFood: 30 * SCALE,
    gatherTimber: 20 * SCALE,
    quarryStone: 15 * SCALE,
    farmCost: { food: 0, timber: 15 * SCALE, stone: 0 },
    huntCost: { food: 0, timber: 15 * SCALE, stone: 0 },
    fisheryCost: { food: 0, timber: 20 * SCALE, stone: 0 },
    woodHousing: { cost: { food: 0, timber: 20 * SCALE, stone: 0 }, capacity: 40 * SCALE },
    stoneHousing: { cost: { food: 0, timber: 0, stone: 20 * SCALE }, capacity: 40 * SCALE },
    campHousing: { cost: { food: 0, timber: 15 * SCALE, stone: 0 }, capacity: 30 * SCALE },
    repair: { maxMaterial: 10 * SCALE, maxCondition: 25 },
    defenses: { cost: { food: 0, timber: 15 * SCALE, stone: 10 * SCALE }, baseCap: 2, techCap: 5 },
    train: { cost: { food: 20 * SCALE, timber: 10 * SCALE, stone: 0 }, cap: 5 },
    relocate: { cost: { food: 10 * SCALE, timber: 0, stone: 0 } },
    expand: { cost: { food: 10 * SCALE, timber: 0, stone: 0 } },
    raid: { cost: { food: 15 * SCALE, timber: 0, stone: 0 }, range: 36, minMilitary: 1 },
    defendMultiplier: 1.5,
    recruit: { cost: { food: 20 * SCALE, timber: 0, stone: 0 }, range: 24, max: 15 * SCALE, fraction: 0.08 },
    scout: { cost: { food: 15 * SCALE, timber: 0, stone: 0 }, range: 40, siteRadius: 6, sitesFound: 2, expiresAfter: 12 },
    found: { cost: { food: 80 * SCALE, timber: 10 * SCALE, stone: 0 }, minPopulation: 80 * SCALE, territoryTiles: 20, campCapacity: 30 * SCALE, maxSettlements: 5 },
    maxCandidates: 40,
    maxTargetsPerLocationAction: 2,
  },

  /**
   * Unions: a much larger tribe may offer to take in a declining neighbour that is still big enough to matter;
   * the smaller tribe decides on a later turn whether to accept. Smaller remnants are conquered or collapse.
   */
  union: {
    /** The offering tribe must have at least this many times the target's people. */
    sizeRatio: 4,
    /** Targets smaller than this are too small to negotiate with (they collapse or are conquered instead). */
    minPopulation: 30 * SCALE,
    /** A target is "declining" if it has fewer people than this many turns ago, or under one turn of food. */
    declineLookback: 5,
    /** At this size ratio a union can be offered even to a neighbour that is not declining. */
    overwhelmingRatio: 8,
    /** Offers stay open for this many turns after the one they were made in. */
    offerTurns: 2,
    /** Share of the joining tribe's people who make the move. */
    joinShare: 0.9,
    /** Food the offering tribe must hold per person it takes in. */
    foodPerJoiner: 1,
    range: 48,
  },

  combat: {
    militaryStep: 0.25,
    fortStep: 0.35,
    mountainDefense: 1.25,
    /** Defense multiplier for a tribe raided in the last two turns. */
    alertDefense: 1.6,
    minChance: 0.1,
    maxChance: 0.9,
    loot: { food: 300 * SCALE, timber: 50 * SCALE, stone: 25 * SCALE },
    successLoss: { attacker: 0.03, defender: 0.06 },
    failureLoss: { attacker: 0.1, defender: 0.02 },
    /** A successful raid by a tribe this many times larger conquers a defender below the union minimum. */
    conquestRatio: 5,
    /** Share of a conquered remnant that survives and joins the conqueror. */
    conquestJoinShare: 0.5,
  },

  population: {
    /** Share of the population lost per turn at a total famine (scaled by the share of food missing). */
    starvationRate: 0.4,
    winterExposure: 0.05,
    birthRate: 0.05,
    /** Extra birth rate while food stocks cover at least `wellFedTurns` turns (turns surplus into growth). */
    wellFedBirthBonus: 0.05,
    wellFedTurns: 3,
    birthMinMorale: 50,
    /** Births stop once the population exceeds this multiple of usable shelter. */
    overcrowding: 1.5,
    spoilage: 0.06,
    storageSpoilage: 0.01,
    maxSpoilage: 0.3,
    /** A tribe that falls below this many people breaks apart and disappears. */
    collapseBelow: 6 * SCALE,
    /** Share of people killed by an epidemic outbreak that spreads to a neighbour in contact. */
    epidemicSpreadShare: 0.5,
  },

  housing: {
    /** Condition loss multiplier by housing type for weather damage. */
    weatherDamage: { wood: 1.0, stone: 0.4, cave: 0.2, camp: 1.3 },
    /** Natural shelter per cave or sheltered tile in working range, capped per tribe. */
    natural: { cave: 20 * SCALE, sheltered: 10 * SCALE, max: 80 * SCALE },
  },

  morale: {
    min: 0,
    max: 100,
    foodDeficit: -8,
    exposureLoss: -4,
    construction: 2,
    raidedSuccessfully: -6,
    raidVictory: 5,
    raidDefeat: -4,
    repelledRaid: 3,
    recruitedFrom: -3,
    recruitGain: 2,
    researchComplete: 4,
    researchCancel: -2,
    wellFed: 1,
    driftTarget: 60,
    driftStep: 3,
  },

  relations: {
    raided: -25,
    raider: -5,
    recruitedFrom: -8,
    recruiter: -2,
    recoveryPerTurn: 1,
    min: -100,
    max: 100,
  },

  memory: { maxEntries: 6, maxAgeTurns: 16 },

  score: {
    population: { weight: 55, target: 1000 * SCALE },
    resilience: { weight: 15, foodTurns: 4, foodShare: 0.6, shelterShare: 0.4 },
    development: { weight: 15, techs: 8 },
    influence: { weight: 15, tiles: 600 },
  },

  effects: {
    maxDuration: 6,
    maxDestructionFraction: 0.6,
    maxOverlayFraction: 0.25,
  },

  events: {
    noRepeatWindow: 5,
    fallbackEventId: "E30",
  },
} as const;

export type Balance = typeof BALANCE;

export const STARTING = {
  population: 100 * SCALE,
  morale: 60,
  housingCapacity: 120 * SCALE,
  fortification: 0,
  food: { producing: 400 * SCALE, ironfang: 700 * SCALE },
  timber: 80 * SCALE,
  stone: 50 * SCALE,
  military: { ironfang: 2, other: 0 },
  startingSites: 4,
} as const;

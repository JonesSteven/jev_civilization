// Versioned balance defaults. Every tunable number used by the engine lives here.
// Changes after playtesting must be recorded in BALANCE_CHANGELOG below and in HANDOFF.md.

export const RULES_VERSION = "rules-2.0.0";

export const BALANCE_CHANGELOG: { version: string; change: string }[] = [
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
    rangePerPopulation: 60,
    maxWorkingRange: 16,
    logisticsRangeBonus: 4,
    expandTiles: 16,
    /** Organic border growth each turn: floor(population / growthPerTiles) unclaimed border tiles, capped. */
    growthPerTiles: 40,
    maxGrowthTilesPerTurn: 6,
    /** Border tiles a successful raid takes from the defender. */
    raidCaptureTiles: 4,
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
    forage: { meadow: 2.5, forest: 3.5, mountain: 0.6, regen: 0.18 },
    wildlife: { meadow: 4.5, forest: 7, mountain: 3, regen: 0.3 },
    fish: { water: 16, regen: 0.35 },
    timber: { forest: 14, meadow: 0.5, mountain: 0.5, regen: 0.04 },
    stone: { mountain: 22, meadow: 0.3, forest: 0.3, regen: 0.01 },
    fertility: { meadowMin: 70, meadowMax: 130, forestDefault: 55, max: 200 },
  },

  production: {
    farm: 18,
    hunt: 18,
    fishery: 18,
    forage: 20,
    routineTimber: 3,
    routineStone: 2,
    season: {
      farm: { spring: 0.8, summer: 1.2, autumn: 1.4, winter: 0.2 },
      hunt: { spring: 1.0, summer: 1.0, autumn: 1.0, winter: 0.8 },
      fish: { spring: 1.0, summer: 1.1, autumn: 1.0, winter: 0.6 },
      forage: { spring: 0.9, summer: 1.1, autumn: 1.2, winter: 0.4 },
    },
    irrigationDryFloor: 0.6,
    /** Labor: each active farm, hunting site, or fishery needs this many people for full output. */
    workersPerSite: 8,
    modifierMin: 0.25,
    modifierMax: 2.0,
  },

  tribeMods: {
    hearthwood: { farm: 1.15, timber: 1.25, woodWeatherDamage: 0.5 },
    windstep: { hunt: 1.3, gatherFood: 1.3, campExposure: 0.6 },
    stonehaven: { stone: 1.3, fish: 1.45 },
    ironfang: { raid: 1.5 },
  },

  tech: {
    agricultureFarm: 1.15,
    fishingFishery: 1.15,
    toolsGather: 1.25,
  },

  actions: {
    restMorale: 4,
    gatherFood: 30,
    gatherTimber: 20,
    quarryStone: 15,
    farmCost: { food: 0, timber: 15, stone: 0 },
    huntCost: { food: 0, timber: 15, stone: 0 },
    fisheryCost: { food: 0, timber: 20, stone: 0 },
    woodHousing: { cost: { food: 0, timber: 20, stone: 0 }, capacity: 40 },
    stoneHousing: { cost: { food: 0, timber: 0, stone: 20 }, capacity: 40 },
    campHousing: { cost: { food: 0, timber: 15, stone: 0 }, capacity: 30 },
    repair: { maxMaterial: 10, maxCondition: 25 },
    defenses: { cost: { food: 0, timber: 15, stone: 10 }, baseCap: 2, techCap: 5 },
    train: { cost: { food: 20, timber: 10, stone: 0 }, cap: 5 },
    relocate: { cost: { food: 10, timber: 0, stone: 0 } },
    expand: { cost: { food: 10, timber: 0, stone: 0 } },
    raid: { cost: { food: 15, timber: 0, stone: 0 }, range: 36, minMilitary: 1 },
    defendMultiplier: 1.5,
    recruit: { cost: { food: 20, timber: 0, stone: 0 }, range: 24, max: 15, fraction: 0.08 },
    scout: { cost: { food: 15, timber: 0, stone: 0 }, range: 40, siteRadius: 6, sitesFound: 2, expiresAfter: 12 },
    found: { cost: { food: 80, timber: 10, stone: 0 }, minPopulation: 80, territoryTiles: 20, campCapacity: 30, maxSettlements: 3 },
    maxCandidates: 40,
    maxTargetsPerLocationAction: 2,
  },

  combat: {
    militaryStep: 0.25,
    fortStep: 0.2,
    mountainDefense: 1.25,
    minChance: 0.1,
    maxChance: 0.9,
    loot: { food: 300, timber: 50, stone: 25 },
    successLoss: { attacker: 0.02, defender: 0.05 },
    failureLoss: { attacker: 0.05, defender: 0.01 },
  },

  population: {
    starvationRate: 0.1,
    winterExposure: 0.02,
    birthRate: 0.04,
    /** Extra birth rate while food stocks cover at least `wellFedTurns` turns (turns surplus into growth). */
    wellFedBirthBonus: 0.03,
    wellFedTurns: 4,
    birthMinMorale: 50,
    spoilage: 0.05,
    storageSpoilage: 0.02,
  },

  housing: {
    /** Condition loss multiplier by housing type for weather damage. */
    weatherDamage: { wood: 1.0, stone: 0.4, cave: 0.2, camp: 1.3 },
    /** Share of exposure applied to sheltered people in poor-condition housing is handled by condition scaling. */
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
    population: { weight: 40, target: 600 },
    resilience: { weight: 25, foodTurns: 4, foodShare: 0.6, shelterShare: 0.4 },
    development: { weight: 20, techs: 8 },
    influence: { weight: 15, tiles: 400 },
  },

  effects: {
    maxDuration: 4,
    maxDestructionFraction: 0.2,
  },

  events: {
    noRepeatWindow: 5,
    fallbackEventId: "E30",
  },
} as const;

export type Balance = typeof BALANCE;

export const STARTING = {
  population: 100,
  morale: 60,
  housingCapacity: 120,
  fortification: 0,
  food: { producing: 400, ironfang: 700 },
  timber: 80,
  stone: 50,
  military: { ironfang: 2, other: 0 },
  startingSites: 4,
} as const;

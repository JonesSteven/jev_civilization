// Core engine types. The engine is pure TypeScript: no DOM, database, network, or framework imports.

export const TRIBE_IDS = ["hearthwood", "windstep", "stonehaven", "ironfang"] as const;
export type TribeId = (typeof TRIBE_IDS)[number];
export type DecisionMode = "live" | "mock";
export type ChoiceSource = "player" | "nature";
export type Season = "spring" | "summer" | "autumn" | "winter";
export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export const GAME_STATUSES = [
  "awaiting_player",
  "nature_pending",
  "deciding",
  "resolving",
  "turn_failed",
  "finished",
  "abandoned",
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const MAP_WIDTH = 150;
export const MAP_HEIGHT = 100;
export const TILE_COUNT = MAP_WIDTH * MAP_HEIGHT;

export const Terrain = {
  Water: 0,
  Meadow: 1,
  Forest: 2,
  Mountain: 3,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];
export const TERRAIN_NAMES = ["water", "meadow", "forest", "mountain"] as const;
export type TerrainName = (typeof TERRAIN_NAMES)[number];

/** Tile overlay bit flags. */
export const Overlay = {
  Flooded: 1,
  Burned: 2,
  Cave: 4,
  Fruit: 8,
  Wheat: 16,
  Ruin: 32,
  Sheltered: 64,
  Thinned: 128,
} as const;

export type ResourceKind = "food" | "timber" | "stone";
export interface ResourceAmounts {
  food: number;
  timber: number;
  stone: number;
}

/** Tile resource layers held as Float32 stocks with Float32 capacities. */
export const TILE_RESOURCES = ["forage", "wildlife", "fish", "timber", "stone"] as const;
export type TileResource = (typeof TILE_RESOURCES)[number];

export interface WorldState {
  width: number;
  height: number;
  terrain: Uint8Array;
  /** -1 unowned, otherwise index into TRIBE_IDS. */
  owner: Int8Array;
  fertility: Uint8Array; // percent, 100 = normal
  overlay: Uint8Array;
  stock: Record<TileResource, Float32Array>;
  cap: Record<TileResource, Float32Array>;
  /** Asset id at tile or -1. One asset per tile. */
  assetAt: Int32Array;
  assets: Asset[];
  nextAssetId: number;
}

export type HousingType = "wood" | "stone" | "cave";
export type AssetKind = "farm" | "hunt" | "fishery" | "housing" | "defenses";

export interface Asset {
  id: number;
  kind: AssetKind;
  tile: number;
  owner: TribeId | null; // null = ruin
  housingType?: HousingType;
  capacity?: number;
  condition?: number; // 0..100
  level?: number; // defenses
  builtTurn: number;
}

export interface CampHousing {
  capacity: number;
  condition: number;
}

export interface ResearchProject {
  techId: string;
  progress: number; // effort turns completed
  required: number;
}

export interface MemoryEntry {
  turn: number;
  kind: string;
  text: string;
}

export interface ScoutedSite {
  tile: number;
  foundTurn: number;
  /** Engine-computed resource summary shown to Jev and the player. */
  food: number;
  timber: number;
  stone: number;
  fish: number;
  terrain: string;
  distance: number;
}

export interface TribeState {
  id: TribeId;
  alive: boolean;
  eliminatedTurn: number | null;
  /** Capital settlement tile. Relocation, defenses, and settlement-level modifiers use the capital. */
  settlement: number;
  /** Additional settlements founded after scouting (at most BALANCE.actions.found.maxSettlements - 1). */
  outposts: number[];
  scoutedSites: ScoutedSite[];
  population: number;
  food: number;
  timber: number;
  stone: number;
  morale: number;
  militaryLevel: number;
  camp: CampHousing | null;
  learned: string[];
  project: ResearchProject | null;
  birthAccumulator: number;
  recentActions: { turn: number; kind: string; label: string }[];
  memory: MemoryEntry[];
  relations: Partial<Record<TribeId, number>>;
  history: TribeHistoryPoint[];
  milestones: { turn: number; text: string }[];
  lastFoodDeficit: boolean;
  lastExposureLoss: number;
}

export interface TribeHistoryPoint {
  turn: number;
  population: number;
  food: number;
  score: number;
}

// ---- Environment ----

export type YieldChannel = "farm" | "hunt" | "fish" | "forage" | "timber" | "stone";
export type Scope = "footprint" | "world";

/** Optional tile filter shared by tile-based effect operations. */
export interface TileFilter {
  terrain?: TerrainName[];
  /** Land within 2 tiles of water, or water tiles themselves for fish. */
  nearWater?: boolean;
}

export type HousingTarget = HousingType | "camp";

/**
 * Typed environmental effect operations. Temporary operations carry a duration (1–4 turns) and are
 * evaluated every applicable turn; one-time operations fire only on activation. See lib/game/effects.
 */
export type EffectOp =
  | ({ op: "yieldMult"; channel: YieldChannel; factor: number; scope: Scope; duration: number } & TileFilter)
  | ({ op: "dryFarm"; factor: number; scope: Scope; duration: number } & TileFilter)
  | ({ op: "travelMod"; delta: number; scope: Scope; duration: number } & TileFilter)
  | ({ op: "regen"; resource: TileResource; factor: number; scope: Scope; duration: number } & TileFilter)
  | ({ op: "stockAdjust"; resource: TileResource; fraction: number; scope: Scope } & TileFilter)
  | ({ op: "capacityAdjust"; resource: TileResource; fraction: number; scope: Scope } & TileFilter)
  | ({ op: "shelterDamage"; amount: number; scope: Scope; types?: HousingTarget[] } & TileFilter)
  | ({ op: "recurringShelterDamage"; amount: number; scope: Scope; duration: number; types?: HousingTarget[] } & TileFilter)
  | { op: "exposure"; add: number; scope: Scope; duration: number }
  | { op: "spoilage"; add: number; scope: Scope; duration: number }
  | ({ op: "fertility"; delta: number; scope: Scope } & TileFilter)
  | { op: "convertTile"; from: TerrainName; to: Exclude<TerrainName, "water">; fraction: number; scope: Scope }
  | ({ op: "overlay"; flag: "Flooded" | "Burned" | "Cave" | "Fruit" | "Wheat" | "Sheltered"; fraction: number; scope: Scope; duration?: number } & TileFilter)
  | ({ op: "settlementStock"; resource: ResourceKind; amount: number; scope: Scope } & TileFilter)
  | { op: "delayed"; afterTurns: number; label: string; effects: EffectOp[] };

export interface ActiveEffect {
  id: string;
  sourceEventId: string;
  sourceOptionId: string;
  label: string;
  op: EffectOp;
  footprint: number[] | null; // null = world
  activatedTurn: number;
  remaining: number; // turns remaining including the current one
  /** Tiles flagged by a temporary overlay, cleared on expiry. */
  flaggedTiles?: number[];
}

export interface QueuedEffect {
  id: string;
  sourceEventId: string;
  sourceOptionId: string;
  label: string;
  activateTurn: number;
  effects: EffectOp[];
  footprint: number[] | null;
}

export interface PreparedEvent {
  turn: number;
  eventId: string;
  source: ChoiceSource;
  footprint: number[] | null;
  footprintLabel: string;
  /** Frozen seeded selection on Nature turns; null on player turns until chosen. */
  natureOptionId: string | null;
  fallback: boolean;
}

export interface EventBag {
  order: string[];
  position: number;
  refills: number;
}

export interface GameState {
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  contentHash: string;
  seed: string;
  generationAttempt: number;
  usedFallbackMap: boolean;
  completedTurn: number;
  /** Match length chosen at creation (10–200). */
  totalTurns: number;
  world: WorldState;
  tribes: Record<TribeId, TribeState>;
  activeEffects: ActiveEffect[];
  queuedEffects: QueuedEffect[];
  eventBag: EventBag;
  recentEventIds: { turn: number; eventId: string }[];
  currentEvent: PreparedEvent | null;
  effectCounter: number;
}

// ---- Actions ----

export type ActionKind =
  | "rest"
  | "gather_food"
  | "gather_timber"
  | "quarry_stone"
  | "establish_farm"
  | "establish_hunt"
  | "establish_fishery"
  | "build_housing"
  | "repair_shelter"
  | "build_defenses"
  | "train"
  | "research_start"
  | "research_continue"
  | "research_cancel"
  | "relocate"
  | "expand"
  | "raid"
  | "defend"
  | "recruit"
  | "send_scouts"
  | "found_settlement";

export type ValidatedTarget =
  | { type: "tile"; tile: number; label: string }
  | { type: "tiles"; tiles: number[]; label: string }
  | { type: "settlement"; tribeId: TribeId; tile: number; label: string }
  | { type: "path"; tile: number; path: number[]; label: string }
  | { type: "asset"; assetId: number; tile: number; label: string }
  | { type: "tech"; techId: string; label: string }
  | { type: "housing"; housingType: HousingType | "camp"; tile: number | null; label: string };

export interface ActionCandidate {
  id: string;
  kind: ActionKind;
  actorId: TribeId;
  target: ValidatedTarget | null;
  costs: ResourceAmounts;
  usesResearchEffort: boolean;
  description: string;
  expectedEffects: string[];
  risks: string[];
}

export interface TribeDecision {
  tribeId: TribeId;
  candidateId: string;
  forced: boolean;
  probabilities: Record<string, number> | null;
  confidence: number | null;
  returnedChoice: string | null;
}

// ---- Outcomes ----

export interface GameOutcome {
  kind: string;
  tribeId: TribeId | null;
  text: string;
  tiles?: number[];
  path?: number[];
  from?: number;
  to?: number;
  success?: boolean;
  amounts?: Partial<ResourceAmounts> & { population?: number };
}

export interface ScoreBreakdown {
  population: number;
  resilience: number;
  development: number;
  influence: number;
  total: number;
}

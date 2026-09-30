// Authored environmental event catalog. 33 families × 3 options, every option wired to typed engine effects.
// Descriptions are player-facing summaries; the UI also lists each typed effect mechanically so copy and
// mechanics can be compared. Never executed as code — the engine dispatches on the typed `effects` data.
//
// Dramatic ruleset: many families strike one region where people live (a random settled area announced with the
// event) instead of the whole land, and their effects are large. Where a storm lands, who has stored food, and who
// resists a sickness decide which tribes flourish and which collapse.

import { SCALE } from "@/content/balance";
import type { EffectOp, Season, TerrainName } from "@/lib/game/types";

export type FootprintSpec =
  | { kind: "world" }
  | { kind: "region"; radius: number }
  /** A region centred on a random tile of claimed land, so the event lands where people live. */
  | { kind: "settledRegion"; radius: number }
  | { kind: "riverBasin"; radius: number }
  | { kind: "terrainPatch"; terrain: TerrainName; maxTiles: number }
  | { kind: "mountainArea"; radius: number };

export type Precondition = { kind: "terrainPresent"; terrain: TerrainName; min: number };

export interface EventOptionDef {
  id: string;
  label: string;
  description: string;
  /** Longest temporary duration among effects; 0 for purely one-time/permanent options. */
  duration: number;
  tone: "mild" | "beneficial" | "harsh" | "mixed";
  effects: EffectOp[];
  /** Short noun phrase for turn summaries ("Hit by the …") when the label does not read as one. */
  cause?: string;
}

export interface EventDef {
  id: string;
  title: string;
  question: string;
  seasons: Season[] | "any";
  preconditions: Precondition[];
  footprint: FootprintSpec;
  repeat: "standard";
  options: [EventOptionDef, EventOptionDef, EventOptionDef];
}

const ANY = "any" as const;
const WORLD: FootprintSpec = { kind: "world" };
/** Regional events: a random settled area, usually one tribe's lands and sometimes a neighbour's too. */
const REGION: FootprintSpec = { kind: "settledRegion", radius: 22 };
const WIDE_REGION: FootprintSpec = { kind: "settledRegion", radius: 28 };
const W = "world" as const;
const F = "footprint" as const;

function longest(effects: EffectOp[]): number {
  return Math.max(0, ...effects.map((x) => ("duration" in x && typeof x.duration === "number" ? x.duration : 0)));
}

function opt(id: string, label: string, tone: EventOptionDef["tone"], description: string, effects: EffectOp[], cause?: string): EventOptionDef {
  return { id, label, description, duration: longest(effects), tone, effects, ...(cause ? { cause } : {}) };
}

function family(
  id: string,
  title: string,
  question: string,
  seasons: Season[] | "any",
  footprint: FootprintSpec,
  options: [EventOptionDef, EventOptionDef, EventOptionDef],
  preconditions: Precondition[] = [],
): EventDef {
  return { id, title, question, seasons, preconditions, footprint, repeat: "standard", options };
}

export const EVENTS: EventDef[] = [
  family("E01", "Season of Rain", "How much rain falls on the region?", ["spring", "summer"], REGION, [
    opt("E01_gentle", "Gentle rains", "beneficial", "Crops and wild plants in the region flourish for three turns.", [
      { op: "yieldMult", channel: "farm", factor: 1.5, scope: F, duration: 3 },
      { op: "yieldMult", channel: "forage", factor: 1.4, scope: F, duration: 3 },
    ]),
    opt("E01_showers", "Timely showers", "beneficial", "Rain arrives just when it is needed: farms and wild plants in the region grow better for two turns, and forest paths stay firm.", [
      { op: "yieldMult", channel: "farm", factor: 1.3, scope: F, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 1.2, scope: F, duration: 2 },
      { op: "travelMod", delta: -1, scope: F, duration: 2, terrain: ["forest"] },
    ]),
    opt("E01_torrential", "Torrential rain", "harsh", "Rivers burst their banks: riverside fields in the region yield half as much for three turns, homes near water are damaged, and travel slows.", [
      { op: "yieldMult", channel: "farm", factor: 0.5, scope: F, duration: 3, nearWater: true },
      { op: "overlay", flag: "Flooded", fraction: 0.25, scope: F, duration: 2, nearWater: true, terrain: ["meadow"] },
      { op: "shelterDamage", amount: 25, scope: F, nearWater: true },
      { op: "travelMod", delta: 1, scope: F, duration: 2 },
    ]),
  ]),
  family("E02", "Winter's Character", "What kind of winter grips the region?", ["winter"], REGION, [
    opt("E02_mild", "Mild winter", "mixed", "Little cold for anyone without shelter in the region, but stored food there rots faster.", [
      { op: "exposure", add: -0.03, scope: F, duration: 2 },
      { op: "spoilage", add: 0.06, scope: F, duration: 2 },
    ]),
    opt("E02_wet", "Wet winter", "harsh", "Sleet soaks the region: wooden homes and camps lose condition every turn for two turns, and meadows turn to mud.", [
      { op: "recurringShelterDamage", amount: 15, scope: F, duration: 2, types: ["wood", "camp"] },
      { op: "travelMod", delta: 1, scope: F, duration: 2, terrain: ["meadow"] },
    ]),
    opt("E02_bitter", "Bitter winter", "harsh", "A killing cold: a quarter of anyone unsheltered in the region may die each turn for two turns, ice stops most fishing, and game grows scarce.", [
      { op: "exposure", add: 0.25, scope: F, duration: 2 },
      { op: "yieldMult", channel: "fish", factor: 0.3, scope: F, duration: 2 },
      { op: "yieldMult", channel: "hunt", factor: 0.6, scope: F, duration: 2 },
    ]),
  ]),
  family("E03", "Length of the Harvest", "How long is the growing season?", ["autumn"], WORLD, [
    opt("E03_brief", "Short harvest", "harsh", "An early chill everywhere: farms yield half as much and herds move away for two turns.", [
      { op: "yieldMult", channel: "farm", factor: 0.5, scope: W, duration: 2 },
      { op: "yieldMult", channel: "hunt", factor: 0.7, scope: W, duration: 2 },
    ]),
    opt("E03_ordinary", "Good harvest", "beneficial", "A solid harvest: farms everywhere yield a quarter more this turn.", [
      { op: "yieldMult", channel: "farm", factor: 1.25, scope: W, duration: 1 },
    ]),
    opt("E03_extended", "Long golden autumn", "mixed", "Farms everywhere yield far more for two turns, but the warm weather spoils stored food faster.", [
      { op: "yieldMult", channel: "farm", factor: 1.8, scope: W, duration: 2 },
      { op: "spoilage", add: 0.04, scope: W, duration: 2 },
    ]),
  ]),
  family("E04", "The Thaw", "How does the thaw unfold in the region?", ["spring"], REGION, [
    opt("E04_gradual", "Gradual thaw", "beneficial", "Farms and wild plants in the region grow strongly for two turns.", [
      { op: "yieldMult", channel: "farm", factor: 1.4, scope: F, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 1.3, scope: F, duration: 2 },
    ]),
    opt("E04_sudden", "Flood thaw", "mixed", "Meltwater floods the region's riverbanks: riverside farms are ruined this turn and homes near water are damaged, but the silt leaves the banks permanently richer.", [
      { op: "yieldMult", channel: "farm", factor: 0.2, scope: F, duration: 1, nearWater: true },
      { op: "overlay", flag: "Flooded", fraction: 0.25, scope: F, duration: 1, nearWater: true, terrain: ["meadow"] },
      { op: "shelterDamage", amount: 20, scope: F, nearWater: true },
      { op: "fertility", delta: 25, scope: F, nearWater: true, terrain: ["meadow"] },
    ]),
    opt("E04_delayed", "Late thaw", "harsh", "Frozen ground lingers in the region: crops and wild plants grow at half pace for two turns.", [
      { op: "yieldMult", channel: "farm", factor: 0.5, scope: F, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 0.6, scope: F, duration: 2 },
    ]),
  ]),
  family("E05", "Seeds on the Wind", "Which seeds do birds spread?", ["spring", "autumn"], WORLD, [
    opt("E05_lumber", "Lumber trees", "mixed", "Young forest spreads over some open meadow: game thrives in it (hunting +30% for three turns) while farms lose ground (−15%). Two turns later forests everywhere hold more timber.", [
      { op: "convertTile", from: "meadow", to: "forest", fraction: 0.1, scope: W },
      { op: "yieldMult", channel: "hunt", factor: 1.3, scope: W, duration: 3 },
      { op: "yieldMult", channel: "farm", factor: 0.85, scope: W, duration: 3 },
      { op: "delayed", afterTurns: 2, label: "Young trees mature", effects: [{ op: "capacityAdjust", resource: "timber", fraction: 0.3, scope: W, terrain: ["forest"] }] },
    ]),
    opt("E05_wheat", "Wild wheat", "beneficial", "Meadows everywhere become permanently more fertile, strengthening farms.", [
      { op: "fertility", delta: 25, scope: W, terrain: ["meadow"] },
      { op: "overlay", flag: "Wheat", fraction: 0.1, scope: W, terrain: ["meadow"] },
    ]),
    opt("E05_fruit", "Fruit bushes", "beneficial", "Fruit bushes spread across the land: wild food is plentiful now, foraging yields half as much again for three turns, and the land holds more wild food for good. Bushes crowd out some timber.", [
      { op: "capacityAdjust", resource: "forage", fraction: 0.6, scope: W, terrain: ["meadow", "forest"] },
      { op: "stockAdjust", resource: "forage", fraction: 0.6, scope: W, terrain: ["meadow", "forest"] },
      { op: "yieldMult", channel: "forage", factor: 1.5, scope: W, duration: 3 },
      { op: "overlay", flag: "Fruit", fraction: 0.1, scope: W, terrain: ["meadow", "forest"] },
      { op: "capacityAdjust", resource: "timber", fraction: -0.15, scope: W, terrain: ["forest"] },
    ]),
  ]),
  family("E06", "Pollinator Bloom", "Where do pollinators flourish in the region?", ["spring", "summer"], WIDE_REGION, [
    opt("E06_meadows", "In the meadows", "beneficial", "Farms in the region yield far more for three turns.", [
      { op: "yieldMult", channel: "farm", factor: 1.8, scope: F, duration: 3 },
    ], "pollinator bloom"),
    opt("E06_forest_edges", "Along forest edges", "beneficial", "Wild fruit is everywhere in the region's forests: forage is replenished and foraging yields much more for three turns.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.6, scope: F, terrain: ["forest"] },
      { op: "yieldMult", channel: "forage", factor: 1.8, scope: F, duration: 3 },
    ], "pollinator bloom"),
    opt("E06_riverbanks", "On the riverbanks", "beneficial", "Shore plants in the region are replenished and regrow twice as fast for three turns.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.6, scope: F, nearWater: true },
      { op: "regen", resource: "forage", factor: 2, scope: F, duration: 3, nearWater: true },
    ], "pollinator bloom"),
  ]),
  family("E07", "Summer Heat", "How hot is the region's summer?", ["summer"], WIDE_REGION, [
    opt("E07_cool", "Cool summer", "mixed", "Crops in the region grow less for two turns, but stored food keeps better.", [
      { op: "yieldMult", channel: "farm", factor: 0.8, scope: F, duration: 2 },
      { op: "spoilage", add: -0.03, scope: F, duration: 2 },
    ]),
    opt("E07_warm", "Warm summer", "beneficial", "Crops in the region grow much more for two turns.", [
      { op: "yieldMult", channel: "farm", factor: 1.5, scope: F, duration: 2 },
    ]),
    opt("E07_scorching", "Great drought", "harsh", "Fields in the region wither to a quarter of their yield for three turns (Irrigation saves most of it), herds and fish dwindle, and fire takes forest timber.", [
      { op: "dryFarm", factor: 0.25, scope: F, duration: 3 },
      { op: "yieldMult", channel: "hunt", factor: 0.6, scope: F, duration: 3 },
      { op: "yieldMult", channel: "fish", factor: 0.6, scope: F, duration: 3 },
      { op: "regen", resource: "forage", factor: 0.3, scope: F, duration: 3 },
      { op: "stockAdjust", resource: "timber", fraction: -0.3, scope: F, terrain: ["forest"] },
    ]),
  ]),
  family("E08", "Forest Understory", "What happens to the forest understory?", ["summer", "autumn"], WORLD, [
    opt("E08_berries", "Berries", "mixed", "Forest forage everywhere is replenished, but tangled growth slows forest travel.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.8, scope: W, terrain: ["forest"] },
      { op: "travelMod", delta: 1, scope: W, duration: 2, terrain: ["forest"] },
    ]),
    opt("E08_brush", "Thick brush", "mixed", "Wildlife fills the forests and breeds twice as fast for three turns, but forest travel is slower.", [
      { op: "stockAdjust", resource: "wildlife", fraction: 0.8, scope: W, terrain: ["forest"] },
      { op: "regen", resource: "wildlife", factor: 2, scope: W, duration: 3 },
      { op: "travelMod", delta: 1, scope: W, duration: 3, terrain: ["forest"] },
    ]),
    opt("E08_sparse", "Sparse growth", "mixed", "Forest travel is easier for three turns, but foraging everywhere yields far less.", [
      { op: "travelMod", delta: -1, scope: W, duration: 3, terrain: ["forest"] },
      { op: "yieldMult", channel: "forage", factor: 0.6, scope: W, duration: 3 },
    ]),
  ]),
  family("E09", "Herd Migration", "What do the herds do in the region?", ["spring", "autumn"], WIDE_REGION, [
    opt("E09_meadows", "Herds crowd the meadows", "mixed", "Herds pour into the region's meadows: game is fully replenished and hunting yields far more for two turns, but grazing herds trample the fields (farms −25%).", [
      { op: "stockAdjust", resource: "wildlife", fraction: 1, scope: F, terrain: ["meadow"] },
      { op: "yieldMult", channel: "hunt", factor: 1.7, scope: F, duration: 2 },
      { op: "yieldMult", channel: "farm", factor: 0.75, scope: F, duration: 2 },
    ], "herd migration"),
    opt("E09_forests", "Herds shelter in the forests", "beneficial", "Forest game in the region is fully replenished: hunting yields more and even gatherers bring home meat (foraging +30%) for two turns.", [
      { op: "stockAdjust", resource: "wildlife", fraction: 1, scope: F, terrain: ["forest"] },
      { op: "yieldMult", channel: "hunt", factor: 1.4, scope: F, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 1.3, scope: F, duration: 2 },
    ], "herd migration"),
    opt("E09_leave", "Vanishing herds", "harsh", "The herds abandon the region: most game is gone, hunting yields a third as much and gathering a quarter less for three turns.", [
      { op: "stockAdjust", resource: "wildlife", fraction: -0.6, scope: F },
      { op: "yieldMult", channel: "hunt", factor: 0.35, scope: F, duration: 3 },
      { op: "yieldMult", channel: "forage", factor: 0.75, scope: F, duration: 3 },
    ]),
  ]),
  family("E10", "Fish Spawning", "How do the fish spawn in the region?", ["spring", "summer"], WIDE_REGION, [
    opt("E10_abundant", "Great salmon run", "beneficial", "Waters in the region fill with fish: fisheries yield far more for two turns, and anyone near the water can catch fish by hand (foraging +30%).", [
      { op: "stockAdjust", resource: "fish", fraction: 1, scope: F },
      { op: "yieldMult", channel: "fish", factor: 1.8, scope: F, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 1.3, scope: F, duration: 2 },
    ]),
    opt("E10_scattered", "Scattered spawning", "mild", "Fish stocks in the region rise, and shallow-water catches add a little to gathering (foraging +20%) for two turns.", [
      { op: "stockAdjust", resource: "fish", fraction: 0.4, scope: F },
      { op: "yieldMult", channel: "forage", factor: 1.2, scope: F, duration: 2 },
    ]),
    opt("E10_poor", "Failed spawning", "harsh", "Hardly any fish return to the region: fisheries yield less than half for three turns, stocks barely recover, and shore gathering suffers (foraging −25%).", [
      { op: "regen", resource: "fish", factor: 0.2, scope: F, duration: 4 },
      { op: "yieldMult", channel: "fish", factor: 0.4, scope: F, duration: 3 },
      { op: "yieldMult", channel: "forage", factor: 0.75, scope: F, duration: 3 },
    ]),
  ]),
  family("E11", "Crop Pest", "What does the pest attack in the region?", ["summer", "autumn"], REGION, [
    opt("E11_wheat", "Locusts in the fields", "harsh", "Locusts strip the region's farms: they yield a fifth as much for three turns.", [
      { op: "yieldMult", channel: "farm", factor: 0.2, scope: F, duration: 3 },
    ]),
    opt("E11_fruit", "Blight on wild fruit", "harsh", "Most wild forage in the region rots now, and foraging yields far less for three turns.", [
      { op: "stockAdjust", resource: "forage", fraction: -0.6, scope: F },
      { op: "yieldMult", channel: "forage", factor: 0.4, scope: F, duration: 3 },
    ]),
    opt("E11_canopy", "Beetles in the canopy", "harsh", "Beetles kill much of the region's timber and the game flees the dying woods: hunting there falls by 40% for three turns and forests regrow slowly for four.", [
      { op: "stockAdjust", resource: "timber", fraction: -0.4, scope: F, terrain: ["forest"] },
      { op: "regen", resource: "timber", factor: 0.2, scope: F, duration: 4 },
      { op: "yieldMult", channel: "hunt", factor: 0.6, scope: F, duration: 3 },
    ]),
  ]),
  family("E12", "Strong Winds", "What do strong winds bring?", ANY, WORLD, [
    opt("E12_clouds", "Rain clouds", "mixed", "Crops everywhere grow better for two turns; wet ground slows travel this turn.", [
      { op: "yieldMult", channel: "farm", factor: 1.3, scope: W, duration: 2 },
      { op: "travelMod", delta: 1, scope: W, duration: 1 },
    ]),
    opt("E12_dry", "Dry winds", "mixed", "Dry winds everywhere: food keeps better and rough ground is easy to cross, but brush fires destroy timber and wild plants and crops wither (foraging −30%, farms −15%) for two turns.", [
      { op: "travelMod", delta: -1, scope: W, duration: 2, terrain: ["forest", "mountain"] },
      { op: "stockAdjust", resource: "timber", fraction: -0.2, scope: W, terrain: ["forest"] },
      { op: "spoilage", add: -0.03, scope: W, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 0.7, scope: W, duration: 2 },
      { op: "yieldMult", channel: "farm", factor: 0.85, scope: W, duration: 2 },
    ]),
    opt("E12_branches", "Fallen branches", "mixed", `Every tribe collects ${15 * SCALE} timber, but wooden homes and camps everywhere take damage.`, [
      { op: "settlementStock", resource: "timber", amount: 15 * SCALE, scope: W },
      { op: "shelterDamage", amount: 15, scope: W, types: ["wood", "camp"] },
    ]),
  ]),
  family("E13", "Lightning Season", "What happens after lightning strikes the region?", ["summer"], REGION, [
    opt("E13_fire", "Forest fire", "harsh", "Fire sweeps the region's forests: half the timber burns and nearby wooden homes and camps are damaged. Two turns later some burned forest opens into fertile meadow.", [
      { op: "stockAdjust", resource: "timber", fraction: -0.5, scope: F, terrain: ["forest"] },
      { op: "overlay", flag: "Burned", fraction: 0.2, scope: F, duration: 2, terrain: ["forest"] },
      { op: "shelterDamage", amount: 30, scope: F, types: ["wood", "camp"] },
      { op: "delayed", afterTurns: 2, label: "Burned forest opens into meadow", effects: [{ op: "convertTile", from: "forest", to: "meadow", fraction: 0.2, scope: F }, { op: "fertility", delta: 15, scope: F, terrain: ["meadow"] }] },
    ]),
    opt("E13_rain", "Heavy rain", "mixed", "Rain puts out the fires: timber regrows twice as fast and crops grow better in the region, but travel slows.", [
      { op: "regen", resource: "timber", factor: 2, scope: F, duration: 2 },
      { op: "yieldMult", channel: "farm", factor: 1.3, scope: F, duration: 2 },
      { op: "travelMod", delta: 1, scope: F, duration: 2 },
    ]),
    opt("E13_scattered", "Scattered strikes", "mild", "Small, dispersed damage in the region: a little timber lost and light damage to shelters.", [
      { op: "stockAdjust", resource: "timber", fraction: -0.1, scope: F, terrain: ["forest"] },
      { op: "shelterDamage", amount: 12, scope: F },
    ]),
  ]),
  family("E14", "Storm Season", "How severe are the storms over the region?", ["autumn", "winter"], REGION, [
    opt("E14_brief", "Brief storms", "mild", "Some damage to every shelter in the region.", [
      { op: "shelterDamage", amount: 12, scope: F },
    ]),
    opt("E14_persistent", "Persistent storms", "harsh", "Weeks of gales: fishing in the region falls to a third and hunting suffers for three turns, and travel is slower.", [
      { op: "yieldMult", channel: "fish", factor: 0.3, scope: F, duration: 3 },
      { op: "yieldMult", channel: "hunt", factor: 0.7, scope: F, duration: 3 },
      { op: "travelMod", delta: 1, scope: F, duration: 3 },
    ]),
    opt("E14_violent", "Violent storms", "harsh", `Storms tear through the region: shelters are badly damaged and people caught outside may die of cold. Survivors collect ${10 * SCALE} timber from fallen trees.`, [
      { op: "shelterDamage", amount: 45, scope: F },
      { op: "exposure", add: 0.1, scope: F, duration: 1 },
      { op: "stockAdjust", resource: "timber", fraction: 0.3, scope: F, terrain: ["forest"] },
      { op: "settlementStock", resource: "timber", amount: 10 * SCALE, scope: F },
    ]),
  ]),
  family("E15", "River Flow", "How do the rivers behave in the region?", ["spring", "summer"], WIDE_REGION, [
    opt("E15_low", "Low water", "harsh", "The rivers shrink: fisheries in the region yield half as much and fish regrow slowly for three turns, though exposed banks offer shore plants.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.4, scope: F, nearWater: true },
      { op: "regen", resource: "fish", factor: 0.3, scope: F, duration: 3 },
      { op: "yieldMult", channel: "fish", factor: 0.5, scope: F, duration: 3 },
    ]),
    opt("E15_stable", "Steady flow", "beneficial", "Good fishing in the region for two turns.", [
      { op: "yieldMult", channel: "fish", factor: 1.4, scope: F, duration: 2 },
    ]),
    opt("E15_high", "Great flood", "harsh", "The rivers flood the region: fish stocks refill, but riverside fields yield a third as much for two turns and homes near water are wrecked.", [
      { op: "stockAdjust", resource: "fish", fraction: 0.6, scope: F },
      { op: "yieldMult", channel: "farm", factor: 0.3, scope: F, duration: 2, nearWater: true },
      { op: "overlay", flag: "Flooded", fraction: 0.25, scope: F, duration: 2, nearWater: true, terrain: ["meadow"] },
      { op: "shelterDamage", amount: 35, scope: F, nearWater: true },
    ]),
  ]),
  family("E16", "Winter Ice", "How does ice form?", ["winter"], WORLD, [
    opt("E16_thin", "Thin ice", "mild", "Fishing everywhere continues at 85% for two turns.", [
      { op: "yieldMult", channel: "fish", factor: 0.85, scope: W, duration: 2 },
    ]),
    opt("E16_thick", "Thick ice", "mixed", "Fishing everywhere almost stops for two turns, but frozen ground makes travel easy.", [
      { op: "yieldMult", channel: "fish", factor: 0.2, scope: W, duration: 2 },
      { op: "travelMod", delta: -1, scope: W, duration: 2 },
    ]),
    opt("E16_uneven", "Uneven ice", "harsh", "Treacherous ice everywhere: fisheries yield half as much, travel is slower, and more people die of cold.", [
      { op: "yieldMult", channel: "fish", factor: 0.5, scope: W, duration: 2 },
      { op: "travelMod", delta: 1, scope: W, duration: 2 },
      { op: "exposure", add: 0.05, scope: W, duration: 2 },
    ]),
  ]),
  family("E17", "Erosion", "What does erosion expose?", ANY, WORLD, [
    opt("E17_stone", "Rock shelters", "beneficial", `Erosion exposes stone and overhangs: mountain stone is replenished, every tribe collects ${20 * SCALE} stone to build with, and some mountain tiles become natural shelter.`, [
      { op: "stockAdjust", resource: "stone", fraction: 0.8, scope: W, terrain: ["mountain"] },
      { op: "settlementStock", resource: "stone", amount: 20 * SCALE, scope: W },
      { op: "overlay", flag: "Cave", fraction: 0.04, scope: W, terrain: ["mountain"] },
    ]),
    opt("E17_soil", "Fertile soil", "beneficial", "Meadows everywhere become permanently more fertile.", [
      { op: "fertility", delta: 20, scope: W, terrain: ["meadow"] },
    ]),
    opt("E17_caves", "Caves", "beneficial", "Many new caves open in the mountains, giving natural shelter to whoever holds them, and sheltered hollows appear in the forests.", [
      { op: "overlay", flag: "Cave", fraction: 0.1, scope: W, terrain: ["mountain"] },
      { op: "overlay", flag: "Sheltered", fraction: 0.06, scope: W, terrain: ["forest"] },
    ]),
  ]),
  family("E18", "Landslide", "Where does a landslide strike the region?", ["spring", "autumn"], REGION, [
    opt("E18_forest", "Forest landslide", "harsh", "Timber in the region is buried, homes on the slopes are damaged, and forest travel is much slower for four turns.", [
      { op: "stockAdjust", resource: "timber", fraction: -0.4, scope: F, terrain: ["forest"] },
      { op: "shelterDamage", amount: 20, scope: F, terrain: ["forest", "mountain"] },
      { op: "travelMod", delta: 2, scope: F, duration: 4, terrain: ["forest"] },
    ]),
    opt("E18_meadow", "Mudslide in the fields", "harsh", `Mud buries the region's fields: meadows lose fertility permanently, though settlements collect ${10 * SCALE} exposed stone.`, [
      { op: "fertility", delta: -25, scope: F, terrain: ["meadow"] },
      { op: "settlementStock", resource: "stone", amount: 10 * SCALE, scope: F },
    ]),
    opt("E18_valley", "Dammed river", "mixed", "A slide dams a river in the region: fish crowd behind the dam (fisheries +50% for two turns), but the rising water floods riverside fields (−30%).", [
      { op: "yieldMult", channel: "fish", factor: 1.5, scope: F, duration: 2 },
      { op: "yieldMult", channel: "farm", factor: 0.7, scope: F, duration: 2, nearWater: true },
      { op: "travelMod", delta: 1, scope: F, duration: 2, terrain: ["meadow"] },
    ]),
  ]),
  family("E19", "Recovering Ground", "What grows on recovering ground?", ["spring"], WORLD, [
    opt("E19_grass", "Grass", "beneficial", "Meadow forage and grazing wildlife everywhere recover now.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.6, scope: W, terrain: ["meadow"] },
      { op: "stockAdjust", resource: "wildlife", fraction: 0.4, scope: W, terrain: ["meadow"] },
    ]),
    opt("E19_saplings", "Saplings", "beneficial", "Undergrowth springs up in the forests, replenishing forest forage now; three turns from now forest timber recovers and forests can hold more timber.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.6, scope: W, terrain: ["forest"] },
      { op: "delayed", afterTurns: 3, label: "Saplings grow into timber", effects: [{ op: "stockAdjust", resource: "timber", fraction: 0.5, scope: W, terrain: ["forest"] }, { op: "capacityAdjust", resource: "timber", fraction: 0.2, scope: W, terrain: ["forest"] }] },
    ]),
    opt("E19_shrubs", "Shrubs", "beneficial", "Wild forage recovers quickly now and regrows twice as fast for two turns.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.8, scope: W },
      { op: "regen", resource: "forage", factor: 2, scope: W, duration: 2 },
    ]),
  ]),
  family("E20", "A Thriving Species", "Which species thrives in the region?", ["summer"], WIDE_REGION, [
    opt("E20_grazers", "Grazers", "mixed", "Game floods into the region, but grazing herds eat the crops: farms yield much less for two turns.", [
      { op: "stockAdjust", resource: "wildlife", fraction: 0.8, scope: F },
      { op: "yieldMult", channel: "farm", factor: 0.6, scope: F, duration: 2 },
    ], "grazing herds"),
    opt("E20_fish", "Fish", "beneficial", "Fish in the region regrow much faster and fisheries yield more for three turns.", [
      { op: "regen", resource: "fish", factor: 2.5, scope: F, duration: 3 },
      { op: "yieldMult", channel: "fish", factor: 1.5, scope: F, duration: 3 },
    ], "thriving fish"),
    opt("E20_pollinators", "Pollinators", "beneficial", "Farms and wild fruit in the region yield much more for two turns.", [
      { op: "yieldMult", channel: "farm", factor: 1.6, scope: F, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 1.5, scope: F, duration: 2 },
    ], "pollinators"),
  ]),
  family("E21", "Wild Harvest", "What kind of wild harvest appears in the region?", ["autumn"], WIDE_REGION, [
    opt("E21_nuts", "Nuts", "beneficial", "The region's forests are full of nuts: forest forage is replenished and foraging yields far more for two turns.", [
      { op: "stockAdjust", resource: "forage", fraction: 1, scope: F, terrain: ["forest"] },
      { op: "yieldMult", channel: "forage", factor: 1.8, scope: F, duration: 2 },
    ]),
    opt("E21_roots", "Roots", "beneficial", "Meadow forage in the region is fully replenished.", [
      { op: "stockAdjust", resource: "forage", fraction: 1, scope: F, terrain: ["meadow"] },
    ]),
    opt("E21_mushrooms", "Mushrooms", "beneficial", "Damp forests near water in the region yield abundant forage; drier forests only a little.", [
      { op: "stockAdjust", resource: "forage", fraction: 1, scope: F, terrain: ["forest"], nearWater: true },
      { op: "stockAdjust", resource: "forage", fraction: 0.3, scope: F, terrain: ["forest"] },
    ]),
  ]),
  family("E22", "Snowfall", "How does the snow fall on the region?", ["winter"], REGION, [
    opt("E22_powder", "Deep snow", "harsh", "Deep snow covers the region for two turns: one in ten of anyone unsheltered may die each turn, and hunting falls by a quarter.", [
      { op: "exposure", add: 0.1, scope: F, duration: 2 },
      { op: "yieldMult", channel: "hunt", factor: 0.75, scope: F, duration: 2 },
    ]),
    opt("E22_heavy", "Blizzard", "harsh", "A blizzard buries the region: nearly a third of anyone unsheltered may die each turn for two turns, hunting halves, and travel all but stops.", [
      { op: "exposure", add: 0.3, scope: F, duration: 2 },
      { op: "yieldMult", channel: "hunt", factor: 0.5, scope: F, duration: 2 },
      { op: "travelMod", delta: 2, scope: F, duration: 2 },
    ]),
    opt("E22_freezing", "Freezing rain", "harsh", "Ice wrecks camps and wooden homes in the region.", [
      { op: "shelterDamage", amount: 40, scope: F, types: ["camp", "wood"] },
    ]),
  ]),
  family("E23", "Windstorm Deposits", "What does a windstorm deposit?", ANY, WORLD, [
    opt("E23_seeds", "Seeds", "beneficial", "Windblown seeds sprout at once (foraging +30% for two turns); two turns from now wild plants spread across the land, with more forage and more room for it.", [
      { op: "yieldMult", channel: "forage", factor: 1.3, scope: W, duration: 2 },
      { op: "delayed", afterTurns: 2, label: "Windblown seeds sprout", effects: [{ op: "capacityAdjust", resource: "forage", fraction: 0.3, scope: W }, { op: "stockAdjust", resource: "forage", fraction: 0.5, scope: W }] },
    ]),
    opt("E23_silt", "Silt", "beneficial", "Meadows near water everywhere become permanently more fertile.", [
      { op: "fertility", delta: 20, scope: W, terrain: ["meadow"], nearWater: true },
    ]),
    opt("E23_driftwood", "Driftwood and shoals", "beneficial", `The storm washes timber ashore, so tribes whose capital is near water collect ${15 * SCALE} timber, and it stirs the shallows, refilling fish stocks everywhere.`, [
      { op: "settlementStock", resource: "timber", amount: 15 * SCALE, scope: W, nearWater: true },
      { op: "stockAdjust", resource: "fish", fraction: 0.5, scope: W },
    ]),
  ]),
  family("E24", "Spreading Vegetation", "Which vegetation spreads fastest?", ["spring", "summer"], WORLD, [
    opt("E24_reeds", "Reeds", "mixed", "Shore forage increases everywhere, but reeds clog fisheries (much lower output for three turns).", [
      { op: "stockAdjust", resource: "forage", fraction: 0.6, scope: W, nearWater: true },
      { op: "yieldMult", channel: "fish", factor: 0.7, scope: W, duration: 3 },
    ]),
    opt("E24_hardwood", "Hardwood", "mixed", "Dense hardwood forests grow everywhere: forests hold more timber for good and forest game thrives (hunting +30% for two turns), but felled timber regrows slowly.", [
      { op: "capacityAdjust", resource: "timber", fraction: 0.3, scope: W, terrain: ["forest"] },
      { op: "regen", resource: "timber", factor: 0.6, scope: W, duration: 2 },
      { op: "yieldMult", channel: "hunt", factor: 1.3, scope: W, duration: 2 },
    ]),
    opt("E24_grain", "Wild grain", "mixed", "Meadows everywhere become more fertile for farms, but hold less wild forage.", [
      { op: "fertility", delta: 20, scope: W, terrain: ["meadow"] },
      { op: "capacityAdjust", resource: "forage", fraction: -0.2, scope: W, terrain: ["meadow"] },
    ]),
  ]),
  family("E25", "Changing Soil", "What happens to the region's soil?", ["summer", "autumn"], REGION, [
    opt("E25_rich", "Rich soil", "beneficial", "Meadows in the region become permanently much more fertile.", [
      { op: "fertility", delta: 30, scope: F, terrain: ["meadow"] },
    ]),
    opt("E25_dry", "Parched soil", "harsh", "The region's fields dry out: farms yield less than half for three turns (Irrigation saves most of it), though firm ground eases travel.", [
      { op: "dryFarm", factor: 0.4, scope: F, duration: 3 },
      { op: "travelMod", delta: -1, scope: F, duration: 3 },
    ]),
    opt("E25_stony", "Stony soil", "mixed", `Settlements in the region collect ${15 * SCALE} stone, but its meadows lose fertility permanently.`, [
      { op: "settlementStock", resource: "stone", amount: 15 * SCALE, scope: F },
      { op: "fertility", delta: -25, scope: F, terrain: ["meadow"] },
    ]),
  ]),
  family("E26", "Before Winter", "What happens before winter?", ["autumn"], WORLD, [
    opt("E26_frost", "Early frost", "harsh", "Frost everywhere kills most of this turn's crops, though the cold slows spoilage for two turns.", [
      { op: "yieldMult", channel: "farm", factor: 0.4, scope: W, duration: 1 },
      { op: "spoilage", add: -0.03, scope: W, duration: 2 },
    ]),
    opt("E26_rains", "Long rains", "mixed", "Wet ground slows travel for two turns, but wild forage everywhere is replenished and grows much more.", [
      { op: "travelMod", delta: 1, scope: W, duration: 2 },
      { op: "stockAdjust", resource: "forage", fraction: 0.4, scope: W },
      { op: "yieldMult", channel: "forage", factor: 1.5, scope: W, duration: 2 },
    ]),
    opt("E26_clear", "Clear skies", "beneficial", "A much better harvest everywhere and easier travel this turn.", [
      { op: "yieldMult", channel: "farm", factor: 1.5, scope: W, duration: 1 },
      { op: "travelMod", delta: -1, scope: W, duration: 1 },
    ]),
  ]),
  family("E27", "Deep Cold", "How hard does the cold bite across the land?", ["winter"], WORLD, [
    opt("E27_crisp", "Crisp and dry", "beneficial", "A dry cold everywhere: less exposure for the unsheltered and stored food keeps well for two turns.", [
      { op: "exposure", add: -0.02, scope: W, duration: 2 },
      { op: "spoilage", add: -0.03, scope: W, duration: 2 },
    ]),
    opt("E27_freeze", "Long freeze", "harsh", "A long freeze everywhere: more of the unsheltered die for three turns and fishing halves.", [
      { op: "exposure", add: 0.1, scope: W, duration: 3 },
      { op: "yieldMult", channel: "fish", factor: 0.5, scope: W, duration: 3 },
    ]),
    opt("E27_larders", "Frozen larders", "mixed", "Stored food keeps perfectly for two turns, but wild plants everywhere are frozen under the snow.", [
      { op: "spoilage", add: -0.06, scope: W, duration: 2 },
      { op: "yieldMult", channel: "forage", factor: 0.4, scope: W, duration: 2 },
    ]),
  ]),
  family("E28", "Wildlife Recovery", "How do wildlife populations recover?", ["spring"], WORLD, [
    opt("E28_rapid", "Rapidly", "beneficial", "Wildlife everywhere regrows two and a half times as fast for three turns.", [
      { op: "regen", resource: "wildlife", factor: 2.5, scope: W, duration: 3 },
    ]),
    opt("E28_gradual", "Gradually", "mild", "Wildlife everywhere regrows 50% faster for three turns.", [
      { op: "regen", resource: "wildlife", factor: 1.5, scope: W, duration: 3 },
    ]),
    opt("E28_uneven", "All at once", "mixed", "Wildlife stocks everywhere refill at once, with no lasting change to regrowth.", [
      { op: "stockAdjust", resource: "wildlife", fraction: 1, scope: W },
    ]),
  ]),
  family("E29", "Storehouse Air", "What happens to the region's food stores?", ["summer"], REGION, [
    opt("E29_dry", "Dry breeze", "beneficial", "Stored food in the region keeps much better for two turns.", [
      { op: "spoilage", add: -0.04, scope: F, duration: 2 },
    ]),
    opt("E29_humid", "Rot in the stores", "harsh", "Damp heat rots stored food in the region: about a fifth more spoils each turn for two turns.", [
      { op: "spoilage", add: 0.2, scope: F, duration: 2 },
    ]),
    opt("E29_cool", "Cool nights", "mixed", "Food in the region keeps a little better, but crops grow weaker for two turns.", [
      { op: "spoilage", add: -0.02, scope: F, duration: 2 },
      { op: "yieldMult", channel: "farm", factor: 0.8, scope: F, duration: 2 },
    ]),
  ]),
  family("E30", "Recovery", "How does depleted land recover?", ANY, WORLD, [
    opt("E30_timber", "Timber", "beneficial", "Forests everywhere recover: timber is restored, forests can hold a little more, and forest game returns.", [
      { op: "stockAdjust", resource: "timber", fraction: 0.6, scope: W, terrain: ["forest"] },
      { op: "capacityAdjust", resource: "timber", fraction: 0.1, scope: W, terrain: ["forest"] },
      { op: "stockAdjust", resource: "wildlife", fraction: 0.4, scope: W, terrain: ["forest"] },
    ]),
    opt("E30_wildlife", "Wildlife", "beneficial", "Hunting stocks everywhere are restored.", [
      { op: "stockAdjust", resource: "wildlife", fraction: 0.6, scope: W },
    ]),
    opt("E30_soil", "Soil", "mild", "Meadow fertility improves and some wild forage returns.", [
      { op: "fertility", delta: 15, scope: W, terrain: ["meadow"] },
      { op: "stockAdjust", resource: "forage", fraction: 0.4, scope: W },
    ]),
  ]),
  family("E31", "Natural Shelter", "What natural shelter becomes available?", ["autumn", "winter"], WORLD, [
    opt("E31_caves", "Caves", "beneficial", "Mountain refuges open: cave tiles give natural shelter to whoever holds them.", [
      { op: "overlay", flag: "Cave", fraction: 0.1, scope: W, terrain: ["mountain"] },
    ]),
    opt("E31_groves", "Dense groves", "beneficial", "Sheltered groves appear in forests across the land, giving natural shelter to whoever holds them.", [
      { op: "overlay", flag: "Sheltered", fraction: 0.12, scope: W, terrain: ["forest"] },
    ]),
    opt("E31_banks", "Sheltered banks", "mixed", "Shore land gains natural shelter, but riverside shelters take flood damage now.", [
      { op: "overlay", flag: "Sheltered", fraction: 0.2, scope: W, nearWater: true, terrain: ["meadow", "forest"] },
      { op: "shelterDamage", amount: 15, scope: W, nearWater: true },
    ]),
  ]),
  family("E32", "Shifting Edges", "What changes along biome boundaries?", ANY, WORLD, [
    opt("E32_meadow", "Meadow expands", "mixed", "Some forest becomes open meadow: fresh clearings make farms yield more (+20% for three turns), while hunters lose forest game (−15%).", [
      { op: "convertTile", from: "forest", to: "meadow", fraction: 0.15, scope: W },
      { op: "yieldMult", channel: "farm", factor: 1.2, scope: W, duration: 3 },
      { op: "yieldMult", channel: "hunt", factor: 0.85, scope: W, duration: 3 },
    ]),
    opt("E32_forest", "Forest expands", "mixed", "Some meadow becomes forest: more timber and game (hunting +20% for three turns), less farmland (farms −15%).", [
      { op: "convertTile", from: "meadow", to: "forest", fraction: 0.15, scope: W },
      { op: "yieldMult", channel: "hunt", factor: 1.2, scope: W, duration: 3 },
      { op: "yieldMult", channel: "farm", factor: 0.85, scope: W, duration: 3 },
    ]),
    opt("E32_mixed", "Mixed edge grows", "mixed", "More forage and wildlife now, but farms and timber gathering everywhere are weaker for three turns.", [
      { op: "stockAdjust", resource: "forage", fraction: 0.4, scope: W },
      { op: "stockAdjust", resource: "wildlife", fraction: 0.4, scope: W },
      { op: "yieldMult", channel: "farm", factor: 0.8, scope: W, duration: 3 },
      { op: "yieldMult", channel: "timber", factor: 0.8, scope: W, duration: 3 },
    ]),
  ]),
  family("E33", "Sickness", "How deadly is the sickness that breaks out in the region?", ANY, REGION, [
    opt("E33_cough", "Passing cough", "mild", "A mild illness: a few people die in the region's settlements, and a little less among neighbours whose land touches theirs. Settled farmers resist it best.", [
      { op: "epidemic", fraction: 0.05, scope: F },
    ]),
    opt("E33_fever", "Fever", "harsh", "A fever kills up to a fifth of the people in the region's settlements and spreads at half strength to neighbours whose land touches theirs. Settled farmers resist it best.", [
      { op: "epidemic", fraction: 0.2, scope: F },
    ]),
    opt("E33_plague", "Plague", "harsh", "A plague kills up to two in five people in the region's settlements and spreads at half strength to neighbours whose land touches theirs. Settled farmers, long used to living beside their animals, resist it best.", [
      { op: "epidemic", fraction: 0.4, scope: F },
    ]),
  ]),
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export function findOption(eventId: string, optionId: string): EventOptionDef | undefined {
  return EVENT_BY_ID[eventId]?.options.find((o) => o.id === optionId);
}

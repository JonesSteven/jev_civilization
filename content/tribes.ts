import type { TribeId } from "@/lib/game/types";

export interface TribeProfile {
  id: TribeId;
  name: string;
  color: string;
  colorDark: string;
  symbol: string; // file name in /public/art
  illustration: string;
  description: string;
  advantages: string[];
  vulnerabilities: string[];
  difficulty: "Approachable" | "Moderate" | "Challenging";
  /** Short traits used in Jev context (public, factual). */
  traits: string[];
  preferences: string[];
  /** Capabilities available without research. Innate capabilities are not earned technology. */
  innate: Capability[];
  startingShelter: "wood" | "cave" | "camp";
  startingSites: "farm" | "hunt" | "fishery" | null;
}

export type Capability =
  | "farming"
  | "hunting"
  | "fishing"
  | "stoneConstruction"
  | "forage"
  | "portableCamps";

export const TRIBES: Record<TribeId, TribeProfile> = {
  hearthwood: {
    id: "hearthwood",
    name: "Hearthwood",
    color: "#c9822b",
    colorDark: "#7a4a12",
    symbol: "/art/emblem-hearthwood.svg",
    illustration: "/art/tribe-hearthwood.svg",
    description:
      "Settled cultivators who value a reliable harvest, family shelter, and maintaining the land around their homes. They prefer preparation and gradual development but will defend their settlements.",
    advantages: [
      "Farming yield ×1.4",
      "Timber gathering ×1.25",
      "Wooden housing takes half the ordinary weather damage",
      "Innate access to farms",
      "Resists epidemics best: dense farming villages carry old immunities",
    ],
    vulnerabilities: [
      "Fixed farms and houses make relocation expensive",
      "Crop pests, droughts, and floods can wipe out a harvest",
    ],
    difficulty: "Approachable",
    traits: ["settled farmers", "skilled woodcutters", "durable wooden homes", "fixed farms and houses"],
    preferences: ["preparation", "gradual development", "defending home"],
    innate: ["farming", "forage"],
    startingShelter: "wood",
    startingSites: "farm",
  },
  windstep: {
    id: "windstep",
    name: "Windstep",
    color: "#16a085",
    colorDark: "#0e5c4c",
    symbol: "/art/emblem-windstep.svg",
    illustration: "/art/tribe-windstep.svg",
    description:
      "Mobile hunting communities who prize independence, knowledge of animals, and the ability to leave an exhausted landscape. They favor movement and opportunity over permanent monuments.",
    advantages: [
      "Hunting and gathering yield ×1.8",
      "Hunting sites draw on game from farther away",
      "Movement budget 10 instead of 6",
      "Portable camp housing moves with them",
      "Lower winter camp exposure",
      "Innate access to hunting sites",
    ],
    vulnerabilities: [
      "Local wildlife can be depleted, and vanishing herds mean hunger",
      "Camps suffer in storms and freezing rain",
      "Especially vulnerable to epidemics",
    ],
    difficulty: "Moderate",
    traits: ["mobile hunters", "long-distance movers", "portable camps", "hardy in winter camps"],
    preferences: ["movement", "opportunity", "independence"],
    innate: ["hunting", "forage", "portableCamps"],
    startingShelter: "camp",
    startingSites: "hunt",
  },
  stonehaven: {
    id: "stonehaven",
    name: "Stonehaven",
    color: "#6b62d6",
    colorDark: "#3b3585",
    symbol: "/art/emblem-stonehaven.svg",
    illustration: "/art/tribe-stonehaven.svg",
    description:
      "Mountain communities skilled at using rock, caves, meadows, and nearby waterways. They value endurance, shelter, and carefully accumulated knowledge.",
    advantages: [
      "Stone gathering ×1.30",
      "Fishing yield ×1.8",
      "Innate stone construction and fishing",
      "Mountain travel cost 2 instead of 3",
    ],
    vulnerabilities: [
      "Shoreline dependence for much of their food: ice and failed spawning bite hard",
      "Slower farming development",
      "Limited mobility compared with Windstep",
    ],
    difficulty: "Moderate",
    traits: ["mountain dwellers", "stone builders", "skilled fishers", "cave shelters"],
    preferences: ["endurance", "secure shelter", "accumulated knowledge"],
    innate: ["fishing", "stoneConstruction", "forage"],
    startingShelter: "cave",
    startingSites: "fishery",
  },
  ironfang: {
    id: "ironfang",
    name: "Ironfang",
    color: "#b8433c",
    colorDark: "#6e1f1a",
    symbol: "/art/emblem-ironfang.svg",
    illustration: "/art/tribe-ironfang.svg",
    description:
      "Mobile raiders who gain supplies and prestige by intimidating or attacking neighboring settlements. They prefer a vulnerable target to slow accumulation, but prolonged scarcity can force them to learn new methods.",
    advantages: [
      "Starting military level 2",
      "Raid attack ×2",
      "Movement budget 8",
      "Portable camp housing",
    ],
    vulnerabilities: [
      "No farms or fisheries until it learns Agriculture or Fishing; it hunts, forages, and raids",
      "Fortified neighbors and empty stores undermine them",
      "Especially vulnerable to epidemics",
    ],
    difficulty: "Challenging",
    traits: ["mobile raiders", "trained fighters", "portable camps", "hunts and forages but has no farms or fisheries until Agriculture or Fishing"],
    preferences: ["raiding vulnerable neighbors", "prestige", "mobility"],
    innate: ["hunting", "portableCamps"],
    startingShelter: "camp",
    startingSites: "hunt",
  },
};

export function tribeName(id: TribeId): string {
  return TRIBES[id].name;
}
